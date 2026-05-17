import { getSupabaseBrowserClient } from './client';
import { REALTIME_CHANNELS } from '@eqr/config';

export function subscribeToMemberEvents(
  memberId: string,
  onEvent: (payload: { eventType: string; record: unknown; oldRecord: unknown }) => void
) {
  const supabase = getSupabaseBrowserClient();
  const channelName = REALTIME_CHANNELS.events(memberId);

  const channel = supabase
    .channel(channelName)
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
  const channelName = REALTIME_CHANNELS.notifications(memberId);

  const channel = supabase
    .channel(channelName)
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

export function subscribeToConflicts(
  memberId: string,
  onConflict: (record: unknown) => void
) {
  const supabase = getSupabaseBrowserClient();

  const channel = supabase
    .channel(`conflicts:${memberId}`)
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
