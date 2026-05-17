import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminOverview } from '@/components/admin/AdminOverview';

export const metadata = { title: 'Admin — Geral' };

export default async function AdminPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: member } = await supabase.from('members').select('role').eq('user_id', user.id).single();
  if (member?.role !== 'admin') redirect('/calendar');

  // Busca dados para o overview
  const [membersRes, eventsRes, conflictsRes, syncRes] = await Promise.all([
    supabase.from('members').select('*').eq('is_active', true).order('name'),
    supabase.from('events').select('member_id, sync_status, status').neq('status', 'cancelled'),
    supabase.from('conflicts').select('member_id').eq('resolved', false),
    supabase.from('event_sync_log').select('status').in('status', ['failed', 'pending']).limit(50),
  ]);

  return (
    <AdminOverview
      members={membersRes.data ?? []}
      events={eventsRes.data ?? []}
      conflicts={conflictsRes.data ?? []}
      failedSyncs={syncRes.data ?? []}
    />
  );
}
