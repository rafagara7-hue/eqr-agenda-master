import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminOverview } from '@/components/admin/AdminOverview';

export const metadata = { title: 'Admin — Geral' };

export default async function AdminPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rawMember } = await supabase.from('members').select('role').eq('user_id', user.id).single();
  const member = rawMember as { role: string } | null;
  if (member?.role !== 'admin') redirect('/calendar');

  // Busca dados para o overview
  const [membersRes, eventsRes, conflictsRes, syncRes] = await Promise.all([
    supabase.from('members').select('*').eq('is_active', true).order('name'),
    supabase
      .from('events')
      .select('id, title, member_id, status, sync_status, sync_error, start_at, end_at')
      .neq('status', 'cancelled')
      .order('start_at'),
    supabase
      .from('conflicts')
      .select('id, member_id, event_id_a, event_id_b')
      .eq('resolved', false),
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
