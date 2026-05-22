'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from './useAuth';

interface FavoriteRow {
  event_id: string;
  created_at: string;
}

const FAVORITES_KEY = ['event-favorites'] as const;

/** Lista os IDs de eventos favoritados pelo membro atual. */
export function useFavorites() {
  const { member } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: async (): Promise<Set<string>> => {
      if (!member) return new Set();
      const { data, error } = await supabase
        .from('event_favorites')
        .select('event_id, created_at')
        .eq('member_id', member.id);
      if (error) throw error;
      const rows = (data ?? []) as FavoriteRow[];
      return new Set(rows.map((r) => r.event_id));
    },
    enabled: !!member,
    staleTime: 60_000,
  });

  // Realtime: invalida ao receber qualquer mudança em event_favorites do membro
  useEffect(() => {
    if (!member) return;
    const channel = supabase
      .channel(`event_favorites:${member.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_favorites',
          filter: `member_id=eq.${member.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [member?.id, queryClient, supabase]);

  return query;
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, isFavorite }: { eventId: string; isFavorite: boolean }) => {
      const res = await fetch(`/api/events/${eventId}/favorite`, {
        method: isFavorite ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' })) as { error?: string };
        throw new Error(err.error ?? 'Erro ao atualizar favorito');
      }
    },
    onMutate: async ({ eventId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = queryClient.getQueryData<Set<string>>(FAVORITES_KEY);
      const next = new Set(previous ?? []);
      if (isFavorite) next.delete(eventId); else next.add(eventId);
      queryClient.setQueryData(FAVORITES_KEY, next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FAVORITES_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}

/** Lista de eventos favoritados com seus detalhes (ordenado por start_at asc). */
export function useFavoritedEvents() {
  const { member } = useAuth();
  const supabase = getSupabaseBrowserClient();

  return useQuery({
    queryKey: ['event-favorites-full', member?.id],
    queryFn: async () => {
      if (!member) return [];
      const { data, error } = await supabase
        .from('event_favorites')
        .select('event_id, events(id, title, start_at, end_at, member_id, status)')
        .eq('member_id', member.id);
      if (error) throw error;

      type Row = {
        event_id: string;
        events: {
          id: string;
          title: string;
          start_at: string;
          end_at: string;
          member_id: string;
          status: string;
        } | null;
      };

      const rows = (data ?? []) as Row[];
      const now = Date.now();
      return rows
        .map((r) => r.events)
        .filter((e): e is NonNullable<Row['events']> => e !== null && e.status !== 'cancelled')
        .map((e) => ({
          id: e.id,
          title: e.title,
          startAt: new Date(e.start_at),
          endAt: new Date(e.end_at),
          memberId: e.member_id,
        }))
        .filter((e) => e.endAt.getTime() >= now - 7 * 24 * 60 * 60 * 1000)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    },
    enabled: !!member,
    staleTime: 60_000,
  });
}
