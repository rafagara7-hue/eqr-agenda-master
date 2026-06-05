import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { MeetingDetailClient } from '@/components/meetings/MeetingDetailClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Detalhes da reunião' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];
type EventRow = Database['public']['Tables']['meeting_request_events']['Row'];
type CommentRow = Database['public']['Tables']['meeting_request_comments']['Row'];

type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr) console.error('[meetings/[id]] member lookup failed', memberErr);

  const member = rawMember as MemberFields | null;
  if (!member) redirect('/login');

  // Fetch da request + history + comments em paralelo
  const [reqRes, histRes, commentsRes] = await Promise.all([
    supabase
      .from('meeting_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('meeting_request_events')
      .select('*')
      .eq('meeting_request_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('meeting_request_comments')
      .select('*')
      .eq('meeting_request_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (reqRes.error) console.error('[meetings/[id]] request query failed', reqRes.error);
  if (histRes.error) console.error('[meetings/[id]] history query failed', histRes.error);
  if (commentsRes.error) console.error('[meetings/[id]] comments query failed', commentsRes.error);

  const request = reqRes.data as RequestRow | null;
  if (!request) notFound();

  // Hidrata nomes dos membros envolvidos
  const memberIds = Array.from(new Set([
    request.requester_id,
    request.target_partner_id,
    request.reviewer_id,
    ...((histRes.data ?? []) as EventRow[]).map((e) => e.actor_id).filter(Boolean) as string[],
    ...((commentsRes.data ?? []) as CommentRow[]).map((c) => c.author_id),
  ].filter(Boolean) as string[]));

  const { data: rawMembers, error: membersErr } = memberIds.length > 0
    ? await supabase
        .from('members')
        .select('id, name, slug, color_hex, avatar_url, role')
        .in('id', memberIds)
    : { data: [] as MemberFields[], error: null };
  if (membersErr) console.error('[meetings/[id]] members query failed', membersErr);

  const hasLoadError = !!(histRes.error || commentsRes.error || membersErr);

  return (
    <MeetingDetailClient
      currentMember={member}
      request={request}
      history={(histRes.data ?? []) as EventRow[]}
      comments={(commentsRes.data ?? []) as CommentRow[]}
      members={(rawMembers ?? []) as MemberFields[]}
      hasLoadError={hasLoadError}
    />
  );
}
