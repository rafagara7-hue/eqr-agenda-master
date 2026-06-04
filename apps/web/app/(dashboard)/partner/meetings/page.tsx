import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PartnerMeetingsClient } from '@/components/meetings/PartnerMeetingsClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Reuniões — Sócio' };

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];
type EventRow = Database['public']['Tables']['events']['Row'];

type PendingFields = Pick<RequestRow,
  'id' | 'title' | 'description' | 'requester_id' |
  'proposed_start' | 'proposed_end' | 'suggested_start' | 'suggested_end' |
  'status' | 'priority' | 'created_at' | 'decision_reason' | 'metadata'
>;
type RecentFields = Pick<RequestRow,
  'id' | 'title' | 'requester_id' | 'proposed_start' | 'status' | 'reviewed_at'
>;
type EventFields = Pick<EventRow, 'id' | 'title' | 'start_at' | 'end_at' | 'status'>;
type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

export default async function PartnerMeetingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .single();
  if (memberErr) console.error('[partner/meetings] member lookup failed', memberErr);

  const member = rawMember as Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'> | null;
  if (!member) redirect('/login');
  if (member.role === 'employee') redirect('/meetings');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const nowIso = new Date().toISOString();

  const [pendingRes, recentRes, eventsRes] = await Promise.all([
    supabase
      .from('meeting_requests')
      .select('id, title, description, requester_id, proposed_start, proposed_end, suggested_start, suggested_end, status, priority, created_at, decision_reason, metadata')
      .eq('target_partner_id', member.id)
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: false }),
    supabase
      .from('meeting_requests')
      .select('id, title, requester_id, proposed_start, status, reviewed_at')
      .eq('target_partner_id', member.id)
      .in('status', ['approved', 'rejected'])
      .gte('reviewed_at', thirtyDaysAgo.toISOString())
      .order('reviewed_at', { ascending: false })
      .limit(10),
    supabase
      .from('events')
      .select('id, title, start_at, end_at, status')
      .eq('member_id', member.id)
      .neq('status', 'cancelled')
      .gte('start_at', nowIso)
      .order('start_at', { ascending: true })
      .limit(8),
  ]);

  const hasLoadError = !!(pendingRes.error || recentRes.error || eventsRes.error);
  if (pendingRes.error) console.error('[partner/meetings] pending query failed', pendingRes.error);
  if (recentRes.error)  console.error('[partner/meetings] recent query failed', recentRes.error);
  if (eventsRes.error)  console.error('[partner/meetings] events query failed', eventsRes.error);

  const pendingRequests = (pendingRes.data ?? []) as PendingFields[];
  const recentDecisions = (recentRes.data ?? []) as RecentFields[];
  const upcomingEvents = (eventsRes.data ?? []) as EventFields[];

  // Resolver nomes — busca somente os requesters necessarios
  const requesterIds = Array.from(new Set([
    ...pendingRequests.map((r) => r.requester_id),
    ...recentDecisions.map((r) => r.requester_id),
  ]));
  const { data: rawRequesters, error: reqErr } = requesterIds.length > 0
    ? await supabase
        .from('members')
        .select('id, name, slug, color_hex, avatar_url, role')
        .in('id', requesterIds)
    : { data: [] as MemberFields[], error: null };
  if (reqErr) console.error('[partner/meetings] requesters query failed', reqErr);

  return (
    <PartnerMeetingsClient
      member={{ id: member.id, name: member.name }}
      pendingRequests={pendingRequests as Array<PendingFields & { status: 'pending' | 'in_review'; priority: 'low' | 'normal' | 'high' | 'urgent' }>}
      recentDecisions={recentDecisions as Array<RecentFields & { status: 'approved' | 'rejected'; reviewed_at: string }>}
      upcomingEvents={upcomingEvents}
      members={(rawRequesters ?? []) as MemberFields[]}
      hasLoadError={hasLoadError}
    />
  );
}
