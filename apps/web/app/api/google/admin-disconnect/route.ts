import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { decryptToken, revokeRefreshToken } from '@/lib/google';

/**
 * Desvincula contas Google de outros members. Apenas admin.
 * Body: { memberId?: string }
 *   - memberId presente: desvincula esse member específico
 *   - memberId ausente:  desvincula TODOS os members (limpa o vínculo geral)
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMember as { id: string; role: string } | null;
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { memberId?: string };

  const serviceDb = await getSupabaseServiceClient();

  let query = serviceDb.from('google_calendar_accounts').select('id, member_id, refresh_token');
  if (body.memberId) query = query.eq('member_id', body.memberId);
  const { data: rows } = await query;
  const accounts = (rows as { id: string; member_id: string; refresh_token: string }[] | null) ?? [];

  // Revoga refresh tokens no Google em paralelo (falhas individuais não bloqueiam)
  await Promise.allSettled(
    accounts.map(async (a) => {
      try {
        const plain = decryptToken(a.refresh_token);
        await revokeRefreshToken(plain);
      } catch {
        // ignora — o que importa é remover do banco
      }
    })
  );

  const memberIds = accounts.map((a) => a.member_id);
  if (memberIds.length > 0) {
    await serviceDb.from('google_calendar_accounts').delete().in('member_id', memberIds);
    await serviceDb.from('members').update({ google_linked: false }).in('id', memberIds);
  }

  return NextResponse.json({ ok: true, disconnected: accounts.length });
}
