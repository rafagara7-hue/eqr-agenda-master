'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToNotifications } from '@/lib/supabase/realtime';
import { useAuth } from './useAuth';

export function useNotifications() {
  const { member } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', member?.id],
    queryFn: async () => {
      if (!member) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!member,
  });

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!member) return;
    const unsubscribe = subscribeToNotifications(member.id, (record) => {
      const notif = record as { id: string; title: string; body?: string | null };

      queryClient.setQueryData(
        ['notifications', member.id],
        (old: typeof query.data) => [record, ...(old ?? [])]
      );

      // Browser notification — only if permission granted and user enabled them in settings
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        localStorage.getItem('eqr-notif') !== 'off'
      ) {
        try {
          new Notification(notif.title, {
            body: notif.body ?? undefined,
            icon: '/favicon.ico',
          });
        } catch {
          // Ignore errors (e.g., browser restrictions, page not focused)
        }
      }
    });
    return unsubscribe;
  }, [member, queryClient]);

  const markRead = async (notificationId: string) => {
    if (!member) return;
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
    queryClient.setQueryData(
      ['notifications', member.id],
      (old: typeof query.data) =>
        (old ?? []).map((n) => n.id === notificationId ? { ...n, read: true } : n)
    );
  };

  const markAllRead = async () => {
    if (!member) return;
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('member_id', member.id)
      .eq('read', false);
    queryClient.setQueryData(
      ['notifications', member.id],
      (old: typeof query.data) => (old ?? []).map((n) => ({ ...n, read: true }))
    );
  };

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead, isLoading: query.isLoading };
}
