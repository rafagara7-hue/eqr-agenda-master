import { getSupabaseBrowserClient } from './client';
import { REALTIME_CHANNELS } from '@eqr/config';

/**
 * Sufixo único por subscription para evitar o erro do Supabase Realtime
 * "cannot add callbacks after subscribe()" quando o mesmo nome de canal é
 * reusado em re-renders ou no React StrictMode.
 */
function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function subscribeToMemberEvents(
  memberId: string,
  onEvent: (payload: { eventType: string; record: unknown; oldRecord: unknown }) => void
) {
  const supabase = getSupabaseBrowserClient();
  const channelName = `${REALTIME_CHANNELS.events(memberId)}:${uniqueSuffix()}`;

  const channel = supabase.channel(channelName);
  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `member_id=eq.${memberId}`,
      },
      (payload) => {
        onEvent({
          eventType: payload.eventType,
          record: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToNotifications(
  memberId: string,
  onNotification: (record: unknown) => void
) {
  const supabase = getSupabaseBrowserClient();
  const channelName = `${REALTIME_CHANNELS.notifications(memberId)}:${uniqueSuffix()}`;

  const channel = supabase.channel(channelName);
  channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `member_id=eq.${memberId}`,
      },
      (payload) => onNotification(payload.new)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Avisa quando um evento é compartilhado com este member (INSERT em event_participants)
 * ou quando deixa de ser (DELETE). Útil pra invalidar o cache de eventos.
 */
export function subscribeToMemberParticipations(
  memberId: string,
  onChange: () => void
) {
  const supabase = getSupabaseBrowserClient();

  const channel = supabase.channel(`event_participants:${memberId}:${uniqueSuffix()}`);
  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_participants',
        filter: `member_id=eq.${memberId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToConflicts(
  memberId: string,
  onConflict: (record: unknown) => void
) {
  const supabase = getSupabaseBrowserClient();

  const channel = supabase.channel(`conflicts:${memberId}:${uniqueSuffix()}`);
  channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conflicts',
        filter: `member_id=eq.${memberId}`,
      },
      (payload) => onConflict(payload.new)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
