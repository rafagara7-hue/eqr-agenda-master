import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MemberOverview } from '@/components/admin/MemberOverview';

export const metadata = { title: 'Geral' };

export default async function GeralPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; name: string; slug: string; color_hex: string; avatar_url: string | null; role: string } | null;

  if (!member) redirect('/login');
  // Admin deve ver o painel completo
  if (member.role === 'admin') redirect('/admin');

  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, end_at, status, sync_status')
    .eq('member_id', member.id)
    .neq('status', 'cancelled')
    .order('start_at', { ascending: true });

  return (
    <MemberOverview
      member={member}
      events={events ?? []}
    />
  );
}
