'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from '@eqr/domain';

async function fetchApi(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error((err as { error?: string }).error ?? 'Erro na requisição');
  }
  return res.json() as Promise<unknown>;
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<CreateEventInput, 'createdBy'>): Promise<CalendarEvent> => {
      const data = await fetchApi('/api/events', 'POST', input);
      return (data as { event: CalendarEvent }).event;
    },
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(`Evento "${event.title}" criado`);
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar evento: ${err.message}`);
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEventInput): Promise<CalendarEvent> => {
      const data = await fetchApi(`/api/events/${input.id}`, 'PUT', input);
      return (data as { event: CalendarEvent }).event;
    },
    onMutate: async (input) => {
      // Cancela queries em flight e aplica optimistic update
      await queryClient.cancelQueries({ queryKey: ['calendar-events'] });

      const snapshot = queryClient.getQueriesData<CalendarEvent[]>({ queryKey: ['calendar-events'] });

      queryClient.setQueriesData<CalendarEvent[]>({ queryKey: ['calendar-events'] }, (old) =>
        (old ?? []).map((e) =>
          e.id === input.id
            ? {
                ...e,
                ...input,
                startAt: input.startAt ?? e.startAt,
                endAt: input.endAt ?? e.endAt,
                updatedAt: new Date(),
              }
            : e
        )
      );

      return { snapshot };
    },
    onError: (err, _input, context) => {
      // Reverte o optimistic update
      if (context?.snapshot) {
        context.snapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast.error(`Erro ao atualizar evento: ${err.message}`);
    },
    onSuccess: () => {
      toast.success('Evento atualizado');
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi(`/api/events/${id}`, 'DELETE');
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['calendar-events'] });
      const snapshot = queryClient.getQueriesData<CalendarEvent[]>({ queryKey: ['calendar-events'] });

      queryClient.setQueriesData<CalendarEvent[]>({ queryKey: ['calendar-events'] }, (old) =>
        (old ?? []).filter((e) => e.id !== id)
      );

      return { snapshot };
    },
    onError: (err, _id, context) => {
      if (context?.snapshot) {
        context.snapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast.error(`Erro ao deletar evento: ${err.message}`);
    },
    onSuccess: () => {
      toast.success('Evento removido');
    },
  });
}
