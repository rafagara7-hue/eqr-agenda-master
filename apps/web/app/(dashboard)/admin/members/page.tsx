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

  const isAdmin = currentMember?.role === 'admin';

  const [membersRes, eventsRes, conflictsRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, name, slug, color_hex, avatar_url, role, is_active, calendar_linked, phone')
      .eq('is_active', true)
      .order('name'),
    // Só busca estatísticas se for admin (members não veem dos outros)
    isAdmin
      ? supabase.from('events').select('member_id, sync_status, status').neq('status', 'cancelled')
      : Promise.resolve({ data: [] as Array<{ member_id: string; sync_status: string; status: string }> }),
    isAdmin
      ? supabase.from('conflicts').select('member_id').eq('resolved', false)
      : Promise.resolve({ data: [] as Array<{ member_id: string }> }),
  ]);

  return (
    <MembersListPage
      members={membersRes.data ?? []}
      events={eventsRes.data ?? []}
      conflicts={conflictsRes.data ?? []}
      currentMemberId={currentMember?.id ?? ''}
      isAdmin={isAdmin}
    />
  );
}
