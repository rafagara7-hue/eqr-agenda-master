import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

// Microsoft Graph não tem endpoint público de revoke de refresh_token.
// Apenas removemos a linha do banco — o token efetivamente fica órfão
// (será inválido na próxima tentativa de uso, mas continua existindo no AAD
// até o usuário revogar manualmente em https://myaccount.microsoft.com/security).
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
  await serviceDb
    .from('calendar_provider_accounts')
    .delete()
    .eq('member_id', member.id)
    .eq('provider', 'microsoft');

  await serviceDb.from('members').update({ calendar_linked: false }).eq('id', member.id);

  return NextResponse.json({ ok: true });
}
