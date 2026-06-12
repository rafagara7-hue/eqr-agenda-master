'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from '@eqr/domain';

class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function fetchApi(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(err.error ?? 'Erro na requisição', res.status, err.code ?? null);
  }
  return res.json() as Promise<unknown>;
}

/**
 * Dispara uma Notification do browser/sistema operacional pra dar feedback push
 * imediato ao criador do evento (o realtime do app só notifica os OUTROS
 * participantes, então o criador não receberia sem isso).
 */
function pushLocalNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('eqr-notif') === 'off') return;
  try {
    new Notification(title, { body, icon: '/logo-eqr.png' });
  } catch {
    // navegador pode bloquear quando não há foco/SW; ignora
  }
}

function formatHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
      const start = event.startAt instanceof Date ? event.startAt : new Date(event.startAt);
      // Mensagem reflete sync_status real (route grava finalStatus na resposta):
      // - synced: confirmado pelo post-PUT verification que iCloud aceitou
      // - failed: push retornou erro OU verification não achou no servidor
      // - pending: ainda processando (raro nesse ponto pois route aguarda)
      // - local_only: sócio sem CalDAV nem Outlook (evento só no EQR)
      const syncMsg =
        event.syncStatus === 'synced' ? 'sincronizado com seu Apple Calendar' :
        event.syncStatus === 'failed' ? 'sincronização com Apple Calendar falhou — verifique conexão CalDAV' :
        event.syncStatus === 'local_only' ? 'evento criado apenas no EQR (sem Apple Calendar conectado)' :
        'sincronização em andamento';
      pushLocalNotification(
        `Evento criado: ${event.title}`,
        `${formatHora(start)} — ${syncMsg}`
      );
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
      // Evento sumiu do banco — limpa cache pra remover da UI também
      if (err instanceof ApiError && (err.status === 404 || err.code === 'EVENT_NOT_FOUND')) {
        void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        toast.error('Este evento não existe mais. A lista foi atualizada.');
        return;
      }
      toast.error(`Erro ao atualizar evento: ${err.message}`);
    },
    onSuccess: (event) => {
      toast.success('Evento atualizado');
      const start = event.startAt instanceof Date ? event.startAt : new Date(event.startAt);
      pushLocalNotification(
        `Evento atualizado: ${event.title}`,
        `Novo horário: ${formatHora(start)}`
      );
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
      if (err instanceof ApiError && (err.status === 404 || err.code === 'EVENT_NOT_FOUND')) {
        void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        toast.error('Este evento já não existia. A lista foi atualizada.');
        return;
      }
      toast.error(`Erro ao deletar evento: ${err.message}`);
    },
    onSuccess: () => {
      toast.success('Evento removido');
    },
  });
}
