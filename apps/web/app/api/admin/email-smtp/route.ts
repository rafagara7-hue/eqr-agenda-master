/**
 * CRUD do conector SMTP do admin.
 *
 *  GET    /api/admin/email-smtp        retorna config (SEM senha — só máscara)
 *  POST   /api/admin/email-smtp        salva/atualiza config (encripta senha)
 *  DELETE /api/admin/email-smtp        remove config (volta a usar Resend)
 *
 * Autorização: só member com role='admin'.
 *
 * Singleton: tabela tem PK fixo '00000000-0000-0000-0000-000000000001' — sempre
 * upsert nesse id. Significa "config global do sistema", não por-admin.
 *
 * Senha:
 *   - POST recebe plaintext
 *   - encripta com AES-256-GCM (chave SMTP_ENCRYPT_KEY)
 *   - grava ciphertext base64 — NUNCA volta no GET
 *   - GET retorna `passwordConfigured: true/false`
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from '@/lib/supabase/server';
import { encrypt } from '@/lib/email/cryptoUtil';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

const postBody = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(3).max(255),
  // password é opcional no update — se vazio, mantém a senha já gravada
  password: z.string().min(1).max(500).optional(),
  fromAddress: z.string().email().max(255),
  fromName: z.string().min(1).max(100),
});

async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized',
    };
  }
  const { data: rawMe } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMe as { id: string; role: string } | null;
  if (!me || me.role !== 'admin') {
    return {
      ok: false as const,
      status: 403,
      error: 'Forbidden',
    };
  }
  return { ok: true as const, user, me };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data } = await serviceDb
    .from('admin_email_smtp_settings')
    .select(
      'smtp_host, smtp_port, smtp_secure, smtp_username, from_address, from_name, verified_at, last_test_error, updated_at'
    )
    .eq('id', SINGLETON_ID)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ configured: false });
  }

  const row = data as {
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_username: string;
    from_address: string;
    from_name: string;
    verified_at: string | null;
    last_test_error: string | null;
    updated_at: string;
  };

  return NextResponse.json({
    configured: true,
    host: row.smtp_host,
    port: row.smtp_port,
    secure: row.smtp_secure,
    username: row.smtp_username,
    fromAddress: row.from_address,
    fromName: row.from_name,
    verifiedAt: row.verified_at,
    lastTestError: row.last_test_error,
    updatedAt: row.updated_at,
    passwordConfigured: true,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = postBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const serviceDb = await getSupabaseServiceClient();

  // Se password não enviado, precisa existir row anterior (mantém senha)
  let passwordEncrypted: string;
  if (parsed.data.password) {
    try {
      passwordEncrypted = encrypt(parsed.data.password);
    } catch (err) {
      console.error('[admin/email-smtp POST] encrypt failed', err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Erro ao encriptar senha. Verifique SMTP_ENCRYPT_KEY no servidor.',
        },
        { status: 500 }
      );
    }
  } else {
    const { data: prev } = await serviceDb
      .from('admin_email_smtp_settings')
      .select('smtp_password_encrypted')
      .eq('id', SINGLETON_ID)
      .maybeSingle();
    const prevRow = prev as { smtp_password_encrypted: string } | null;
    if (!prevRow) {
      return NextResponse.json(
        { error: 'Senha SMTP é obrigatória no primeiro cadastro' },
        { status: 400 }
      );
    }
    passwordEncrypted = prevRow.smtp_password_encrypted;
  }

  const { error } = await serviceDb.from('admin_email_smtp_settings').upsert(
    {
      id: SINGLETON_ID,
      created_by: auth.user.id,
      smtp_host: parsed.data.host.trim(),
      smtp_port: parsed.data.port,
      smtp_secure: parsed.data.secure,
      smtp_username: parsed.data.username.trim(),
      smtp_password_encrypted: passwordEncrypted,
      from_address: parsed.data.fromAddress.trim(),
      from_name: parsed.data.fromName.trim(),
      // Reset verified_at — admin precisa testar de novo após mudar config
      verified_at: null,
      last_test_error: null,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[admin/email-smtp POST] upsert failed', error);
    return NextResponse.json(
      { error: 'Erro ao salvar configuração' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { error } = await serviceDb
    .from('admin_email_smtp_settings')
    .delete()
    .eq('id', SINGLETON_ID);
  if (error) {
    console.error('[admin/email-smtp DELETE] failed', error);
    return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
