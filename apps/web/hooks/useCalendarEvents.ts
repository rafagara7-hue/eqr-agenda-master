'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToMemberEvents, subscribeToMemberParticipations } from '@/lib/supabase/realtime';
import { useAuth } from './useAuth';
import type { CalendarEvent, EventParticipant, EventReminder } from '@eqr/domain';
import type { Database } from '@eqr/database';

type DbEvent = Database['public']['Tables']['events']['Row'];
type DbParticipantRow = { member_id: string; role: 'owner' | 'participant'; can_edit: boolean };
type EventRowWithParticipants = DbEvent & { event_participants?: DbParticipantRow[] | null };

function extractReminders(metadata: Record<string, unknown> | null | undefined): EventReminder[] {
  if (!metadata) return [];
  const raw = (metadata as { reminders?: unknown }).reminders;
  if (!Array.isArray(raw)) return [];
  const valid: EventReminder[] = [];
  for (const r of raw) {
    if (
      typeof r === 'object' &&
      r !== null &&
      'method' in r &&
      'minutes' in r &&
      (r.method === 'popup' || r.method === 'email') &&
      typeof r.minutes === 'number'
    ) {
      valid.push({ method: r.method, minutes: r.minutes });
    }
  }
  return valid;
}

function dbToCalendarEvent(row: EventRowWithParticipants): CalendarEvent {
  const participants: EventParticipant[] = (row.event_participants ?? []).map((p) => ({
    memberId: p.member_id,
    role: p.role,
    canEdit: p.can_edit,
  }));
  const participantIds = participants.length > 0
    ? participants.map((p) => p.memberId)
    : [row.member_id];
  const metadata = (row.metadata as Record<string, unknown>) ?? {};

  return {
    id: row.id,
    memberId: row.member_id,
    participantIds,
    participants,
    reminders: extractReminders(metadata),
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
    externalEventId: row.external_event_id,
    externalProvider: row.external_provider,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    colorOverride: row.color_override,
    metadata,
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

  // getTime() é estável e mais barato que toISOString(); sorted memberIds
  // garantem queryKey igual independentemente da ordem da array recebida —
  // evita refetch contínuo quando o parent re-renderiza memberIds em outra ordem.
  const queryKey = [
    'calendar-events',
    startAt.getTime(),
    endAt.getTime(),
    memberIds ? [...memberIds].sort().join(',') : null,
  ];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<CalendarEvent[]> => {
      // Filtragem por member: usar event_participants (não member_id)
      let allowedIds: string[] | null = null;
      if (!isAdmin && member) {
        const { data: pRows } = await supabase
          .from('event_participants')
          .select('event_id')
          .eq('member_id', member.id);
        allowedIds = ((pRows ?? []) as { event_id: string }[]).map((r) => r.event_id);
        if (allowedIds.length === 0) return [];
      } else if (memberIds && memberIds.length > 0) {
        const { data: pRows } = await supabase
          .from('event_participants')
          .select('event_id')
          .in('member_id', memberIds);
        allowedIds = ((pRows ?? []) as { event_id: string }[]).map((r) => r.event_id);
        if (allowedIds.length === 0) return [];
      }

      let q = supabase
        .from('events')
        .select('*, event_participants(member_id, role, can_edit)')
        .lt('start_at', endAt.toISOString())
        .gt('end_at', startAt.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true });

      if (allowedIds) q = q.in('id', allowedIds);

      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as EventRowWithParticipants[]).map(dbToCalendarEvent);
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
      // Para INSERT/UPDATE/DELETE invalidamos a query inteira em vez de
      // mutar o cache local. Dois motivos:
      //  (a) o payload realtime de `events` NAO traz o join `event_participants`,
      //      logo `dbToCalendarEvent(record)` apaga participantes do cache (bug #2).
      //  (b) o `queryKey` capturado no closure pode ser de uma semana antiga
      //      apos navegacao, escrevendo em cache obsoleto (bug #3).
      // Invalidacao por chave-pai resolve ambos sem precisar refazer o fetch a mao.
      subscribeToMemberEvents(memberId, () => {
        void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      })
    );

    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, isAdmin, memberIds?.join(',')]);

  // Quando alguém me adiciona/remove de event_participants, reavalia.
  useEffect(() => {
    if (!member) return;
    const unsub = subscribeToMemberParticipations(member.id, () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    });
    return unsub;
  }, [member?.id, queryClient]);

  return query;
}
