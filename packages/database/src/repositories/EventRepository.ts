import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CreateEventInput, UpdateEventInput, IEventRepository, EventsFilter } from '@eqr/domain';
import type { Database } from '../types/supabase.js';

type DbEvent = Database['public']['Tables']['events']['Row'];

function toCalendarEvent(row: DbEvent): CalendarEvent {
  return {
    id: row.id,
    memberId: row.member_id,
    participantIds: row.participants ?? [row.member_id],
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

export class EventRepository implements IEventRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<CalendarEvent | null> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toCalendarEvent(data);
  }

  async findByMemberId(memberId: string, filter?: EventsFilter): Promise<CalendarEvent[]> {
    let query = this.db.from('events').select('*').eq('member_id', memberId);
    if (filter?.startAt) query = query.gte('start_at', filter.startAt.toISOString());
    if (filter?.endAt) query = query.lte('end_at', filter.endAt.toISOString());
    if (filter?.status) query = query.eq('status', filter.status);
    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findByMemberId: ${error.message}`);
    return (data ?? []).map(toCalendarEvent);
  }

  async findAll(filter?: EventsFilter): Promise<CalendarEvent[]> {
    let query = this.db.from('events').select('*');
    if (filter?.memberId) query = query.eq('member_id', filter.memberId);
    if (filter?.startAt) query = query.gte('start_at', filter.startAt.toISOString());
    if (filter?.endAt) query = query.lte('end_at', filter.endAt.toISOString());
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.syncStatus) query = query.eq('sync_status', filter.syncStatus);
    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findAll: ${error.message}`);
    return (data ?? []).map(toCalendarEvent);
  }

  async findByDateRange(startAt: Date, endAt: Date, memberId?: string): Promise<CalendarEvent[]> {
    let query = this.db
      .from('events')
      .select('*')
      .lt('start_at', endAt.toISOString())
      .gt('end_at', startAt.toISOString())
      .neq('status', 'cancelled');
    if (memberId) query = query.contains('participants', [memberId]);
    const { data, error } = await query.order('start_at', { ascending: true });
    if (error) throw new Error(`EventRepository.findByDateRange: ${error.message}`);
    return (data ?? []).map(toCalendarEvent);
  }

  async create(input: CreateEventInput): Promise<CalendarEvent> {
    const participants = input.participantIds && input.participantIds.length > 0
      ? Array.from(new Set([input.memberId, ...input.participantIds]))
      : [input.memberId];

    const { data, error } = await this.db
      .from('events')
      .insert({
        member_id: input.memberId,
        participants,
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
      .select()
      .single();
    if (error || !data) throw new Error(`EventRepository.create: ${error?.message}`);
    return toCalendarEvent(data);
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
    if (input.participantIds !== undefined) {
      const base = input.participantIds;
      updatePayload.participants = input.memberId
        ? Array.from(new Set([input.memberId, ...base]))
        : base;
    }

    const { data, error } = await this.db
      .from('events')
      .update(updatePayload)
      .eq('id', input.id)
      .select()
      .single();
    if (error || !data) throw new Error(`EventRepository.update: ${error?.message}`);
    return toCalendarEvent(data);
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
