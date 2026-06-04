import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MeetingRequest,
  MeetingRequestComment,
  MeetingRequestEvent,
  MeetingRequestStatus,
  MeetingRequestPriority,
  MeetingRequestAction,
  ConflictSnapshot,
  CreateMeetingRequestInput,
  ApproveMeetingRequestInput,
  RejectMeetingRequestInput,
  SuggestRescheduleInput,
  IMeetingRequestRepository,
  MeetingRequestFilter,
  MeetingRequestWithDetails,
} from '@eqr/domain';
import type { Database } from '../types/supabase.js';

type DbMR = Database['public']['Tables']['meeting_requests']['Row'];
type DbMRP = Database['public']['Tables']['meeting_request_participants']['Row'];
type DbMRE = Database['public']['Tables']['meeting_request_events']['Row'];
type DbMRC = Database['public']['Tables']['meeting_request_comments']['Row'];

function toMeetingRequest(row: DbMR): MeetingRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    targetPartnerId: row.target_partner_id,
    title: row.title,
    description: row.description,
    observations: row.observations,
    proposedStart: new Date(row.proposed_start),
    proposedEnd: new Date(row.proposed_end),
    durationMinutes: row.duration_minutes,
    priority: row.priority,
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    decisionReason: row.decision_reason,
    suggestedStart: row.suggested_start ? new Date(row.suggested_start) : null,
    suggestedEnd: row.suggested_end ? new Date(row.suggested_end) : null,
    suggestedAt: row.suggested_at ? new Date(row.suggested_at) : null,
    resultingEventId: row.resulting_event_id,
    detectedConflicts: (row.detected_conflicts as ConflictSnapshot[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toEvent(row: DbMRE): MeetingRequestEvent {
  return {
    id: row.id,
    meetingRequestId: row.meeting_request_id,
    actorId: row.actor_id,
    action: row.action,
    fromStatus: row.from_status as MeetingRequestStatus | null,
    toStatus: row.to_status as MeetingRequestStatus | null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at),
  };
}

function toComment(row: DbMRC): MeetingRequestComment {
  return {
    id: row.id,
    meetingRequestId: row.meeting_request_id,
    authorId: row.author_id,
    body: row.body,
    visibleToRequester: row.visible_to_requester,
    createdAt: new Date(row.created_at),
  };
}

export class MeetingRequestRepository implements IMeetingRequestRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<MeetingRequestWithDetails | null> {
    const { data, error } = await this.db
      .from('meeting_requests')
      .select('*, meeting_request_participants(member_id)')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const base = toMeetingRequest(data as unknown as DbMR);
    const participantIds = ((data as unknown as { meeting_request_participants?: { member_id: string }[] | null })
      .meeting_request_participants ?? []).map((p) => p.member_id);
    return { ...base, participantIds };
  }

  async findAll(filter?: MeetingRequestFilter): Promise<MeetingRequest[]> {
    let query = this.db.from('meeting_requests').select('*');
    if (filter?.status?.length) query = query.in('status', filter.status);
    if (filter?.requesterId) query = query.eq('requester_id', filter.requesterId);
    if (filter?.targetPartnerId) query = query.eq('target_partner_id', filter.targetPartnerId);
    if (filter?.priority) query = query.eq('priority', filter.priority);
    if (filter?.startAfter) query = query.gte('proposed_start', filter.startAfter.toISOString());
    if (filter?.startBefore) query = query.lte('proposed_start', filter.startBefore.toISOString());
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`findAll meeting_requests: ${error.message}`);
    return (data as unknown as DbMR[] | null ?? []).map(toMeetingRequest);
  }

  async create(input: CreateMeetingRequestInput): Promise<MeetingRequest> {
    const { data, error } = await this.db
      .from('meeting_requests')
      .insert({
        requester_id: input.requesterId,
        target_partner_id: input.targetPartnerId,
        title: input.title,
        description: input.description ?? null,
        observations: null,
        proposed_start: input.proposedStart.toISOString(),
        proposed_end: input.proposedEnd.toISOString(),
        priority: input.priority ?? 'normal',
        status: 'pending',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`create meeting_request: ${error?.message ?? 'unknown'}`);
    const created = toMeetingRequest(data as unknown as DbMR);

    if (input.participantIds && input.participantIds.length > 0) {
      const rows = input.participantIds.map((memberId) => ({
        meeting_request_id: created.id,
        member_id: memberId,
        optional: false,
      }));
      await this.db.from('meeting_request_participants').insert(rows);
    }

    // Audit
    await this.db.from('meeting_request_events').insert({
      meeting_request_id: created.id,
      actor_id: input.requesterId,
      action: 'created' as MeetingRequestAction,
      from_status: null,
      to_status: 'pending',
      payload: {},
    });

    return created;
  }

  async cancel(id: string, requesterId: string): Promise<void> {
    const { error } = await this.db
      .from('meeting_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('requester_id', requesterId)
      .in('status', ['pending', 'in_review']);
    if (error) throw new Error(`cancel meeting_request: ${error.message}`);

    await this.db.from('meeting_request_events').insert({
      meeting_request_id: id,
      actor_id: requesterId,
      action: 'cancelled' as MeetingRequestAction,
      to_status: 'cancelled',
      payload: {},
    });
  }

  async approve(input: ApproveMeetingRequestInput): Promise<string> {
    const { data, error } = await this.db.rpc('approve_meeting_request', {
      p_request_id: input.requestId,
      p_reviewer_id: input.reviewerId,
      p_decision_note: input.decisionNote ?? null,
    });
    if (error) throw new Error(`approve_meeting_request: ${error.message}`);
    return data as unknown as string;
  }

  async reject(input: RejectMeetingRequestInput): Promise<void> {
    const { error } = await this.db.rpc('reject_meeting_request', {
      p_request_id: input.requestId,
      p_reviewer_id: input.reviewerId,
      p_reason: input.reason,
    });
    if (error) throw new Error(`reject_meeting_request: ${error.message}`);
  }

  async suggestReschedule(input: SuggestRescheduleInput): Promise<void> {
    const { error } = await this.db.rpc('suggest_reschedule', {
      p_request_id: input.requestId,
      p_partner_id: input.partnerId,
      p_new_start: input.newStart.toISOString(),
      p_new_end: input.newEnd.toISOString(),
      p_message: input.message ?? null,
    });
    if (error) throw new Error(`suggest_reschedule: ${error.message}`);
  }

  async getHistory(id: string): Promise<MeetingRequestEvent[]> {
    const { data, error } = await this.db
      .from('meeting_request_events')
      .select('*')
      .eq('meeting_request_id', id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getHistory: ${error.message}`);
    return (data as unknown as DbMRE[] | null ?? []).map(toEvent);
  }

  async getComments(id: string): Promise<MeetingRequestComment[]> {
    const { data, error } = await this.db
      .from('meeting_request_comments')
      .select('*')
      .eq('meeting_request_id', id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getComments: ${error.message}`);
    return (data as unknown as DbMRC[] | null ?? []).map(toComment);
  }

  async addComment(input: {
    meetingRequestId: string;
    authorId: string;
    body: string;
    visibleToRequester?: boolean;
  }): Promise<MeetingRequestComment> {
    const { data, error } = await this.db
      .from('meeting_request_comments')
      .insert({
        meeting_request_id: input.meetingRequestId,
        author_id: input.authorId,
        body: input.body,
        visible_to_requester: input.visibleToRequester ?? true,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`addComment: ${error?.message ?? 'unknown'}`);
    return toComment(data as unknown as DbMRC);
  }
}
