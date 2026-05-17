'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToMemberEvents } from '@/lib/supabase/realtime';
import { useAuth } from './useAuth';
import type { CalendarEvent } from '@eqr/domain';
import type { Database } from '@eqr/database';

type DbEvent = Database['public']['Tables']['events']['Row'];

function dbToCalendarEvent(row: DbEvent): CalendarEvent {
  return {
    id: row.id,
    memberId: row.member_id,
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

interface UseCalendarEventsOptions {
  startAt: Date;
  endAt: Date;
  memberIds?: string[];
}

export function useCalendarEvents({ startAt, endAt, memberIds }: UseCalendarEventsOptions) {
  const { member, isAdmin } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();

  const queryKey = ['calendar-events', startAt.toISOString(), endAt.toISOString(), memberIds?.join(',')];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<CalendarEvent[]> => {
      let q = supabase
        .from('events')
        .select('*')
        .lt('start_at', endAt.toISOString())
        .gt('end_at', startAt.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true });

      if (!isAdmin && member) {
        q = q.eq('member_id', member.id);
      } else if (memberIds && memberIds.length > 0) {
        q = q.in('member_id', memberIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(dbToCalendarEvent);
    },
    enabled: !!member,
    staleTime: 30_000,
  });

  // Subscribe a eventos realtime do membro atual
  useEffect(() => {
    if (!member) return;

    const memberIdsToWatch = isAdmin
      ? (memberIds ?? [member.id])
      : [member.id];

    const unsubscribes = memberIdsToWatch.map((memberId) =>
      subscribeToMemberEvents(memberId, ({ eventType, record, oldRecord }) => {
        queryClient.setQueryData(queryKey, (old: CalendarEvent[] | undefined) => {
          const current = old ?? [];

          if (eventType === 'INSERT' && record) {
            const newEvent = dbToCalendarEvent(record as DbEvent);
            const inRange = newEvent.startAt < endAt && newEvent.endAt > startAt;
            if (!inRange) return current;
            return [...current, newEvent].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
          }

          if (eventType === 'UPDATE' && record) {
            const updated = dbToCalendarEvent(record as DbEvent);
            return current
              .filter((e) => e.id !== updated.id)
              .concat(updated.startAt < endAt && updated.endAt > startAt ? [updated] : [])
              .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
          }

          if (eventType === 'DELETE' && oldRecord) {
            const deleted = oldRecord as { id: string };
            return current.filter((e) => e.id !== deleted.id);
          }

          return current;
        });
      })
    );

    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, isAdmin, memberIds?.join(',')]);

  return query;
}
