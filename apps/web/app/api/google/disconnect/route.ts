import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { decryptToken, revokeRefreshToken } from '@/lib/google';

// Revoga o refresh token no Google e remove a conta do banco.
export async function POST(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawAccount } = await serviceDb
    .from('google_calendar_accounts')
    .select('refresh_token')
    .eq('member_id', member.id)
    .maybeSingle();
  const account = rawAccount as { refresh_token: string } | null;

  if (account) {
    try {
      const plain = decryptToken(account.refresh_token);
      await revokeRefreshToken(plain);
    } catch {
      // Mesmo se a revogação falhar, removemos do banco
    }
    await serviceDb.from('google_calendar_accounts').delete().eq('member_id', member.id);
  }

  await serviceDb.from('members').update({ google_linked: false }).eq('id', member.id);

  return NextResponse.json({ ok: true });
}
