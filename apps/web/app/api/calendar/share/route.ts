import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/calendar/share
 *
 * Gera/regenera/revoga o calendar_share_token de um member.
 *
 * Body:
 *   { memberId: uuid, action: 'generate' | 'revoke' }
 *
 * Autorização:
 *   - Próprio member pode mexer no token dele
 *   - Admin pode mexer no token de qualquer member
 *
 * Returns:
 *   - { ok: true, token: string | null }  ← null se action='revoke'
 *
 * "Generate" sempre cria token novo (rotaciona) — efetivamente revoga URLs antigas
 * porque o endpoint público busca pelo token exato.
 */

const bodySchema = z.object({
  memberId: z.string().uuid(),
  action: z.enum(['generate', 'revoke']),
});

function generateToken(): string {
  // 32 bytes random → base64url 43 chars (sem padding, URL-safe)
  return crypto.randomBytes(32).toString('base64url');
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMe } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMe as { id: string; role: 'admin' | 'member' | 'employee' } | null;
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { memberId, action } = parsed.data;

  // Autorização: próprio member OU admin
  const isOwn = me.id === memberId;
  const isAdmin = me.role === 'admin';
  if (!isOwn && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Usa service client pra escapar RLS (que pode não permitir UPDATE em outro member)
  const serviceDb = await getSupabaseServiceClient();

  const newToken = action === 'generate' ? generateToken() : null;

  const { error } = await serviceDb
    .from('members')
    .update({ calendar_share_token: newToken })
    .eq('id', memberId);

  if (error) {
    console.error('[api/calendar/share] update failed', { memberId, action, error: error.message });
    return NextResponse.json({ error: 'Erro ao atualizar token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: newToken });
}
