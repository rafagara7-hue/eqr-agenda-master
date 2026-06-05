import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminMeetingsClient } from '@/components/meetings/AdminMeetingsClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Reuniões — Admin' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];

type RequestFields = Pick<RequestRow,
  'id' | 'title' | 'requester_id' | 'target_partner_id' |
  'proposed_start' | 'proposed_end' | 'suggested_start' | 'suggested_end' |
  'status' | 'priority' | 'created_at' | 'reviewed_at' | 'decision_reason'
>;
type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

export default async function AdminMeetingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('user_id', user.id)
    .single();
  if (memberErr) console.error('[admin/meetings] member lookup failed', memberErr);

  const member = rawMember as Pick<MemberRow, 'id' | 'name' | 'role'> | null;
  if (!member) redirect('/login');
  if (member.role !== 'admin') redirect('/meetings');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [requestsRes, membersRes] = await Promise.all([
    supabase
      .from('meeting_requests')
      .select('id, title, requester_id, target_partner_id, proposed_start, proposed_end, suggested_start, suggested_end, status, priority, created_at, reviewed_at, decision_reason')
      .or(`status.in.(pending,in_review),created_at.gte.${thirtyDaysAgo.toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('members')
      .select('id, name, slug, color_hex, avatar_url, role')
      .eq('is_active', true)
      .order('name'),
  ]);

  const hasLoadError = !!(requestsRes.error || membersRes.error);
  if (requestsRes.error) console.error('[admin/meetings] requests query failed', requestsRes.error);
  if (membersRes.error)  console.error('[admin/meetings] members query failed', membersRes.error);

  return (
    <AdminMeetingsClient
      member={{ id: member.id, name: member.name }}
      requests={(requestsRes.data ?? []) as RequestFields[]}
      members={(membersRes.data ?? []) as MemberFields[]}
      hasLoadError={hasLoadError}
    />
  );
}
