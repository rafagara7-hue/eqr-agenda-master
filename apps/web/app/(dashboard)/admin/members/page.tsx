import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MembersListPage } from '@/components/admin/MembersListPage';

export const metadata = { title: 'Membros' };

export default async function MembersPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawCurrentMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const currentMember = rawCurrentMember as { id: string; role: string } | null;

  const { data: members } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role, is_active, google_linked, phone')
    .eq('is_active', true)
    .order('name');

  return (
    <MembersListPage
      members={members ?? []}
      currentMemberId={currentMember?.id ?? ''}
      isAdmin={currentMember?.role === 'admin'}
    />
  );
}
