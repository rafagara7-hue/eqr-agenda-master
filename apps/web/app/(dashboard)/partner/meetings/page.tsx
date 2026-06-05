import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PartnerMeetingsClient } from '@/components/meetings/PartnerMeetingsClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Reuniões — Sócio' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];

type PendingFields = Pick<RequestRow,
  'id' | 'title' | 'description' | 'requester_id' |
  'proposed_start' | 'proposed_end' | 'suggested_start' | 'suggested_end' |
  'status' | 'priority' | 'created_at' | 'decision_reason' | 'metadata'
>;
type UpcomingApprovedFields = Pick<RequestRow,
  'id' | 'title' | 'description' | 'requester_id' | 'target_partner_id' |
  'proposed_start' | 'proposed_end' | 'suggested_start' | 'suggested_end' |
  'decision_reason' | 'metadata'
>;
type RecentDecisionFields = Pick<RequestRow,
  'id' | 'title' | 'requester_id' | 'proposed_start' | 'status' | 'reviewed_at' | 'decision_reason'
>;
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

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [pendingRes, outgoingRes, upcomingRes, historyRes] = await Promise.all([
    // INCOMING: requests targeting o sócio logado
    supabase
      .from('meeting_requests')
      .select('id, title, description, requester_id, target_partner_id, proposed_start, proposed_end, suggested_start, suggested_end, status, priority, created_at, decision_reason, metadata')
      .eq('target_partner_id', member.id)
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: false }),
    // OUTGOING: requests CRIADAS pelo sócio logado (que ele enviou pra outros)
    supabase
      .from('meeting_requests')
      .select('id, title, description, requester_id, target_partner_id, proposed_start, proposed_end, suggested_start, suggested_end, status, priority, created_at, decision_reason, metadata')
      .eq('requester_id', member.id)
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: false }),
    // UPCOMING APPROVED: reunioes aprovadas futuras (como target ou requester)
    supabase
      .from('meeting_requests')
      .select('id, title, description, requester_id, target_partner_id, proposed_start, proposed_end, suggested_start, suggested_end, decision_reason, metadata')
      .or(`target_partner_id.eq.${member.id},requester_id.eq.${member.id}`)
      .eq('status', 'approved')
      .gte('proposed_start', nowIso)
      .order('proposed_start', { ascending: true })
      .limit(20),
    // HISTORY: decisoes (approved + rejected) ultimos 30 dias como target. Visivel via botao "Historico".
    supabase
      .from('meeting_requests')
      .select('id, title, requester_id, proposed_start, status, reviewed_at, decision_reason')
      .eq('target_partner_id', member.id)
      .in('status', ['approved', 'rejected'])
      .gte('reviewed_at', thirtyDaysAgo.toISOString())
      .order('reviewed_at', { ascending: false })
      .limit(20),
  ]);

  const hasLoadError = !!(pendingRes.error || outgoingRes.error || upcomingRes.error || historyRes.error);
  if (pendingRes.error)  console.error('[partner/meetings] pending query failed', pendingRes.error);
  if (outgoingRes.error) console.error('[partner/meetings] outgoing query failed', outgoingRes.error);
  if (upcomingRes.error) console.error('[partner/meetings] upcoming query failed', upcomingRes.error);
  if (historyRes.error)  console.error('[partner/meetings] history query failed', historyRes.error);

  const pendingRequests = (pendingRes.data ?? []) as PendingFields[];
  const outgoingRequests = (outgoingRes.data ?? []) as PendingFields[];
  const upcomingApproved = (upcomingRes.data ?? []) as UpcomingApprovedFields[];
  const recentDecisions = (historyRes.data ?? []) as RecentDecisionFields[];

  // Resolver nomes — busca todos members envolvidos
  const memberIds = Array.from(new Set([
    ...pendingRequests.map((r) => r.requester_id),
    ...outgoingRequests.map((r) => r.target_partner_id),
    ...upcomingApproved.flatMap((r) => [r.requester_id, r.target_partner_id]),
    ...recentDecisions.map((r) => r.requester_id),
  ]));
  const { data: rawMembers, error: reqErr } = memberIds.length > 0
    ? await supabase
        .from('members')
        .select('id, name, slug, color_hex, avatar_url, role')
        .in('id', memberIds)
    : { data: [] as MemberFields[], error: null };
  if (reqErr) console.error('[partner/meetings] members query failed', reqErr);

  return (
    <PartnerMeetingsClient
      member={{ id: member.id, name: member.name }}
      pendingRequests={pendingRequests as Array<PendingFields & { status: 'pending' | 'in_review'; priority: 'low' | 'normal' | 'high' | 'urgent' }>}
      outgoingRequests={outgoingRequests as Array<PendingFields & { status: 'pending' | 'in_review'; priority: 'low' | 'normal' | 'high' | 'urgent' }>}
      upcomingApproved={upcomingApproved}
      recentDecisions={recentDecisions as Array<RecentDecisionFields & { status: 'approved' | 'rejected'; reviewed_at: string }>}
      members={(rawMembers ?? []) as MemberFields[]}
      hasLoadError={hasLoadError}
    />
  );
}
