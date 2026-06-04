import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewMeetingClient } from '@/components/meetings/NewMeetingClient';

export const metadata = { title: 'Nova solicitação' };

export default async function NewMeetingPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; name: string; role: string } | null;
  if (!member) redirect('/login');

  const { data: partners } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .in('role', ['member', 'admin'])
    .eq('is_active', true)
    .neq('id', member.id)
    .order('name');

  return (
    <NewMeetingClient
      member={member}
      partners={(partners ?? []) as Array<{ id: string; name: string; slug: string; color_hex: string; avatar_url: string | null; role: string }>}
    />
  );
}
