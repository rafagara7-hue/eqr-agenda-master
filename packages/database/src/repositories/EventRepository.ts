import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CreateEventInput, UpdateEventInput, IEventRepository, EventsFilter, EventParticipant } from '@eqr/domain';
import type { Database } from '../types/supabase.js';

type DbEvent = Database['public']['Tables']['events']['Row'];
type DbParticipantRow = { member_id: string; role: 'owner' | 'participant'; can_edit: boolean };

type EventRowWithParticipants = DbEvent & {
  event_participants?: DbParticipantRow[] | null;
};

const EVENT_SELECT_WITH_PARTICIPANTS =
  '*, event_participants(member_id, role, can_edit)';

function toParticipants(rows: DbParticipantRow[] | null | undefined): EventParticipant[] {
  return (rows ?? []).map((p) => ({
    memberId: p.member_id,
    role: p.role,
    canEdit: p.can_edit,
  }));
}

function toCalendarEvent(row: EventRowWithParticipants): CalendarEvent {
  const participants = toParticipants(row.event_participants);
  const participantIds = participants.length > 0
    ? participants.map((p) => p.memberId)
    : [row.member_id];

  return {
    id: row.id,
    memberId: row.member_id,
    participantIds,
    participants,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: new Date(row.start_at),
    endAt: new Date(row.end_at),
    allDay: row.all_day,
    status: row.status,
    visibility: row.visibility,
    recurrenceId: row.recurrence_id,
    recurrenceExceptionDate: row.recurrence_exception_date ? new Date(row.recurrence_exception_date) : null,
    isRecurrenceRoot: row.is_recurrence_root,
    googleEventId: row.google_event_id,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    colorOverride: row.color_override,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function syncParticipants(
  db: SupabaseClient<Database>,
  eventId: string,
  hostId: string,
  extraIds: string[],
  hostCanEdit: boolean,
  extrasCanEdit: boolean
): Promise<void> {
  const uniqueExtras = Array.from(new Set(extraIds.filter((id) => id !== hostId)));
  const rows: Database['public']['Tables']['event_participants']['Insert'][] = [
    { event_id: eventId, member_id: hostId, role: 'owner', can_edit: hostCanEdit },
    ...uniqueExtras.map((mid) => ({
      event_id: eventId,
      member_id: mid,
      role: 'participant' as const,
      can_edit: extrasCanEdit,
    })),
  ];

  const { error: delErr } = await db
    .from('event_participants')
    .delete()
    .eq('event_id', eventId);
  if (delErr) throw new Error(`EventRepository.syncParticipants(delete): ${delErr.message}`);

  const { error: insErr } = await db.from('event_participants').insert(rows);
  if (insErr) throw new Error(`EventRepository.syncParticipants(insert): ${insErr.message}`);
}

export class EventRepository implements IEventRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<CalendarEvent | null> {
    const { data, error } = await this.db
      .from('events')
      .select(EVENT_SELECT_WITH_PARTICIPANTS)
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toCalendarEvent(data as unknown as EventRowWithParticipants);
  }

  async findByMemberId(memberId: string, filter?: EventsFilter): Promise<CalendarEvent[]> {
    // Eventos onde o member é participante (owner ou participant).
    const { data: pRows, error: pErr } = await this.db
      .from('event_participants')
      .select('event_id')
      .eq('member_id', memberId);
    if (pErr) throw new Error(`EventRepository.findByMemberId(participants): ${pErr.message}`);
    const eventIds = (pRows ?? []).map((r) => r.event_id);
    if (eventIds.length === 0) return [];

    let query = this.db.from('events').select(EVENT_SELECT_WITH_PARTICIPANTS).in('id', eventIds);
    if (filter?.startAt) query = query.gte('start_at', filter.startAt.toISOString());
    if (filter?.endAt) query = query.lte('end_at', filter.endAt.toISOString());
    if (filter?.status) query = query.eq('status', filter.status);
    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findByMemberId: ${error.message}`);
    return ((data ?? []) as unknown as EventRowWithParticipants[]).map(toCalendarEvent);
  }

  async findAll(filter?: EventsFilter): Promise<CalendarEvent[]> {
    let query = this.db.from('events').select(EVENT_SELECT_WITH_PARTICIPANTS);
    if (filter?.memberId) {
      const { data: pRows } = await this.db
        .from('event_participants')
        .select('event_id')
        .eq('member_id', filter.memberId);
      const ids = (pRows ?? []).map((r) => r.event_id);
      if (ids.length === 0) return [];
      query = query.in('id', ids);
    }
    if (filter?.startAt) query = query.gte('start_at', filter.startAt.toISOString());
    if (filter?.endAt) query = query.lte('end_at', filter.endAt.toISOString());
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.syncStatus) query = query.eq('sync_status', filter.syncStatus);
    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findAll: ${error.message}`);
    return ((data ?? []) as unknown as EventRowWithParticipants[]).map(toCalendarEvent);
  }

  async findByDateRange(startAt: Date, endAt: Date, memberId?: string): Promise<CalendarEvent[]> {
    let allowedIds: string[] | null = null;
    if (memberId) {
      const { data: pRows, error: pErr } = await this.db
        .from('event_participants')
        .select('event_id')
        .eq('member_id', memberId);
      if (pErr) throw new Error(`EventRepository.findByDateRange(participants): ${pErr.message}`);
      allowedIds = (pRows ?? []).map((r) => r.event_id);
      if (allowedIds.length === 0) return [];
    }

    let query = this.db
      .from('events')
      .select(EVENT_SELECT_WITH_PARTICIPANTS)
      .lt('start_at', endAt.toISOString())
      .gt('end_at', startAt.toISOString())
      .neq('status', 'cancelled');
    if (allowedIds) query = query.in('id', allowedIds);

    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findByDateRange: ${error.message}`);
    return ((data ?? []) as unknown as EventRowWithParticipants[]).map(toCalendarEvent);
  }

  async create(input: CreateEventInput): Promise<CalendarEvent> {
    const { data: inserted, error } = await this.db
      .from('events')
      .insert({
        member_id: input.memberId,
        created_by: input.createdBy,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start_at: input.startAt.toISOString(),
        end_at: input.endAt.toISOString(),
        all_day: input.allDay ?? false,
        status: input.status ?? 'confirmed',
        recurrence_id: input.recurrenceId ?? null,
        color_override: input.colorOverride ?? null,
        sync_status: 'pending',
      })
      .select('id')
      .single();
    if (error || !inserted) throw new Error(`EventRepository.create: ${error?.message}`);

    await syncParticipants(
      this.db,
      inserted.id,
      input.memberId,
      input.participantIds ?? [],
      true,
      input.participantsCanEdit ?? false
    );

    const created = await this.findById(inserted.id);
    if (!created) throw new Error('EventRepository.create: failed to refetch created event');
    return created;
  }

  async update(input: UpdateEventInput): Promise<CalendarEvent> {
    const updatePayload: Database['public']['Tables']['events']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (input.title !== undefined) updatePayload.title = input.title;
    if (input.description !== undefined) updatePayload.description = input.description ?? null;
    if (input.location !== undefined) updatePayload.location = input.location ?? null;
    if (input.startAt !== undefined) updatePayload.start_at = input.startAt.toISOString();
    if (input.endAt !== undefined) updatePayload.end_at = input.endAt.toISOString();
    if (input.allDay !== undefined) updatePayload.all_day = input.allDay;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.colorOverride !== undefined) updatePayload.color_override = input.colorOverride ?? null;

    const { data, error } = await this.db
      .from('events')
      .update(updatePayload)
      .eq('id', input.id)
      .select('id, member_id')
      .maybeSingle();
    if (error) throw new Error(`EventRepository.update: ${error.message}`);
    if (!data) throw new Error('EVENT_NOT_FOUND');

    if (input.participantIds !== undefined) {
      const host = input.memberId ?? data.member_id;
      await syncParticipants(
        this.db,
        data.id,
        host,
        input.participantIds,
        true,
        input.participantsCanEdit ?? false
      );
    }

    const updated = await this.findById(data.id);
    if (!updated) throw new Error('EventRepository.update: failed to refetch event');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('events').delete().eq('id', id);
    if (error) throw new Error(`EventRepository.delete: ${error.message}`);
  }

  async updateSyncStatus(id: string, syncStatus: string, googleEventId?: string, syncError?: string): Promise<void> {
    const { error } = await this.db
      .from('events')
      .update({
        sync_status: syncStatus as Database['public']['Tables']['events']['Update']['sync_status'],
        google_event_id: googleEventId ?? undefined,
        sync_error: syncError ?? null,
        last_synced_at: syncStatus === 'synced' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`EventRepository.updateSyncStatus: ${error.message}`);
  }
}
