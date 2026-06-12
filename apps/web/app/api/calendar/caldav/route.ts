/**
 * GET    /api/calendar/caldav             status da conexão CalDAV do member logado
 * POST   /api/calendar/caldav             conecta — valida credenciais + salva encriptado
 * DELETE /api/calendar/caldav             desconecta — remove row
 *
 * Apenas o próprio member ou admin pode mexer na conexão do member.
 *
 * Segurança:
 *   - app-specific password encriptado AES-256-GCM (reuso cryptoUtil do SMTP)
 *   - GET nunca retorna password
 *   - POST valida conectando ao iCloud antes de persistir
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from '@/lib/supabase/server';
import { encrypt } from '@/lib/email/cryptoUtil';
import { connectCalDAV } from '@/lib/caldav/client';

// Remove invisíveis (zero-width, NBSP, etc) que copy-paste de mobile/Mac
// frequentemente injeta nos campos email/senha. Sem isso, z.email() rejeita
// o que parece visualmente correto.
const stripInvisibles = (s: string): string =>
  s
    .replace(/[​-‍﻿]/g, '') // zero-width space/joiner/non-joiner/BOM
    .replace(/ /g, ' ') // NBSP → espaço normal
    .trim();

const postBody = z.object({
  appleIdEmail: z
    .string()
    .transform((s) => stripInvisibles(s).toLowerCase())
    .pipe(z.string().email('Apple ID inválido (esperado formato email)').max(255)),
  appPassword: z
    .string()
    .transform((s) => stripInvisibles(s))
    .pipe(z.string().min(1, 'App password obrigatório').max(255)),
  /** Override do member_id (só admin pode). Se omitir, usa o próprio. */
  memberId: z.string().uuid().optional(),
});

async function authorize(memberId?: string) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const { data: rawMe } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMe as { id: string; role: string } | null;
  if (!me) return { ok: false as const, status: 403, error: 'Forbidden' };

  // Se memberId não foi passado, usa o próprio
  const targetMemberId = memberId ?? me.id;

  if (me.id !== targetMemberId && me.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user, me, targetMemberId };
}

export async function GET() {
  const auth = await authorize();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data } = await serviceDb
    .from('caldav_connections')
    .select(
      'apple_id_email, calendar_url, calendar_name, verified_at, last_sync_at, last_error, updated_at'
    )
    .eq('member_id', auth.targetMemberId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ connected: false });
  }

  const row = data as {
    apple_id_email: string;
    calendar_url: string | null;
    calendar_name: string | null;
    verified_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
    updated_at: string;
  };

  return NextResponse.json({
    connected: true,
    appleIdEmail: row.apple_id_email,
    calendarName: row.calendar_name,
    verifiedAt: row.verified_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const parsed = postBody.safeParse(raw);
  if (!parsed.success) {
    const firstErr = parsed.error.errors?.[0];
    // Log com hint de chars problemáticos (sem vazar a senha) pra diagnosticar
    // copy-paste com invisíveis. Não loga email completo por privacidade.
    const rawEmail = (raw as { appleIdEmail?: unknown })?.appleIdEmail;
    if (typeof rawEmail === 'string') {
      const codepoints = Array.from(rawEmail)
        .filter((c) => c.charCodeAt(0) > 127 || c.charCodeAt(0) < 32)
        .map((c) => 'U+' + c.charCodeAt(0).toString(16).padStart(4, '0'));
      console.warn('[caldav POST] validation failed', {
        emailLength: rawEmail.length,
        nonAsciiCodepoints: codepoints.length > 0 ? codepoints : 'none',
        error: firstErr?.message,
      });
    }
    return NextResponse.json(
      { error: firstErr?.message ?? 'Dados inválidos' },
      { status: 400 }
    );
  }

  const auth = await authorize(parsed.data.memberId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 1. Valida conectando ao iCloud
  const result = await connectCalDAV({
    appleIdEmail: parsed.data.appleIdEmail.trim(),
    appPassword: parsed.data.appPassword.trim(),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }

  // 2. Encripta password
  let passwordEncrypted: string;
  try {
    passwordEncrypted = encrypt(parsed.data.appPassword.trim());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro ao encriptar password. Verifique SMTP_ENCRYPT_KEY no servidor.',
      },
      { status: 500 }
    );
  }

  // 3. Salva (upsert por member_id)
  const serviceDb = await getSupabaseServiceClient();
  const { error } = await serviceDb.from('caldav_connections').upsert(
    {
      member_id: auth.targetMemberId,
      apple_id_email: parsed.data.appleIdEmail.trim().toLowerCase(),
      app_password_encrypted: passwordEncrypted,
      calendar_url: result.primary.url,
      calendar_name: result.primary.displayName,
      verified_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'member_id' }
  );

  if (error) {
    console.error('[caldav POST] upsert failed', {
      memberId: auth.targetMemberId,
      code: error.code ?? null,
      message: error.message,
    });
    return NextResponse.json({ error: 'Erro ao salvar conexão' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    calendar: {
      url: result.primary.url,
      name: result.primary.displayName,
    },
    availableCalendars: result.calendars,
  });
}

export async function DELETE(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const memberId = typeof raw === 'object' && raw && 'memberId' in raw && typeof (raw as Record<string, unknown>).memberId === 'string'
    ? (raw as { memberId: string }).memberId
    : undefined;

  const auth = await authorize(memberId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { error } = await serviceDb
    .from('caldav_connections')
    .delete()
    .eq('member_id', auth.targetMemberId);

  if (error) {
    console.error('[caldav DELETE] failed', {
      memberId: auth.targetMemberId,
      code: error.code ?? null,
      message: error.message,
    });
    return NextResponse.json({ error: 'Erro ao desconectar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
