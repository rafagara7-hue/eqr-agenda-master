/**
 * POST /api/members/me/email   { email }
 *
 * Permite ao member logado atualizar o próprio email (auth.users.email).
 * Esse email é usado tanto pra login quanto pra receber convites .ics.
 *
 * Por que existe:
 *   - Sócios podem ter o email registrado errado (admin cadastrou no início)
 *   - Em vez de pedir pro admin corrigir, sócio mesmo entra e ajusta
 *   - Pra que o convite caia no inbox que ele lê de verdade
 *
 * Segurança:
 *   - Atualiza somente o email do user que está fazendo a request (auth.uid())
 *   - Email é validado com zod
 *   - Auto-confirma (email_confirm:true) pra não enviar email de verificação
 *     — assumimos que sócio sabe o que tá fazendo
 *
 * Side effect:
 *   - Próximo login desse sócio precisa do email novo + senha atual
 *   - Senha NÃO muda
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from '@/lib/supabase/server';

const bodySchema = z.object({
  email: z.string().email('Email inválido').max(255),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Garante que o caller é um member ativo
  const { data: rawMember } = await supabase
    .from('members')
    .select('id, name, is_active')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; name: string; is_active: boolean } | null;
  if (!member || !member.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Email inválido' },
      { status: 400 }
    );
  }

  const newEmail = parsed.data.email.trim().toLowerCase();
  if (newEmail === user.email?.toLowerCase()) {
    return NextResponse.json({ ok: true, unchanged: true, email: newEmail });
  }

  // Service client porque updateUserById é admin-only
  const serviceDb = await getSupabaseServiceClient();
  const { error: updateErr } = await serviceDb.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: true,
  });

  if (updateErr) {
    const msg = updateErr.message ?? 'Erro ao atualizar email';
    const status = msg.toLowerCase().includes('already') ? 409 : 500;
    console.error('[members/me/email] failed', {
      userId: user.id,
      newEmail,
      error: msg,
    });
    return NextResponse.json(
      {
        error: status === 409
          ? 'Esse email já está em uso por outra conta'
          : 'Erro ao atualizar email',
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, email: newEmail });
}
