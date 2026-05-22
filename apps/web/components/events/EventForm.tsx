'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MemberSelector, type MemberOption } from './MemberSelector';
import { ParticipantsSelector } from './ParticipantsSelector';
import { ConflictWarning } from './ConflictWarning';
import { useCreateEvent, useUpdateEvent } from '@/hooks/useEventMutations';
import { readAgendaSettingsSync } from '@/hooks/useAgendaSettings';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@eqr/domain';

const eventSchema = z.object({
  memberId: z.string().min(1, 'Selecione um membro'),
  participantIds: z.array(z.string()).default([]),
  title: z.string().min(1, 'Título obrigatório').max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().min(1, 'Data/hora de início obrigatória'),
  endAt: z.string().min(1, 'Data/hora de término obrigatória'),
  allDay: z.boolean().optional(),
  status: z.enum(['confirmed', 'tentative']).optional(),
}).refine((d) => new Date(d.startAt) < new Date(d.endAt), {
  message: 'O término deve ser após o início',
  path: ['endAt'],
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  event?: CalendarEvent;
  initialDate?: Date;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface ConflictingEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

function formatDateTimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function EventForm({ event, initialDate, onSuccess, onCancel }: EventFormProps) {
  const { member, isAdmin } = useAuth();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const [conflicts, setConflicts] = useState<ConflictingEvent[]>([]);
  const supabase = getSupabaseBrowserClient();

  const { data: dbMembers = [] } = useQuery<MemberOption[]>({
    queryKey: ['members-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, color_hex, avatar_url')
        .eq('is_active', true)
        .neq('slug', 'admin')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        colorHex: m.color_hex,
        avatarUrl: m.avatar_url,
      }));
    },
    staleTime: 5 * 60_000,
  });

  const isEditing = !!event;

  const defaultStart = initialDate ?? new Date();
  const defaultEnd = new Date(defaultStart.getTime() + readAgendaSettingsSync().defaultDuration * 60 * 1000);

  const initialParticipants = (event?.participantIds ?? []).filter((p) => p !== (event?.memberId ?? ''));

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      memberId: event?.memberId ?? member?.id ?? '',
      participantIds: initialParticipants,
      title: event?.title ?? '',
      description: event?.description ?? '',
      location: event?.location ?? '',
      startAt: formatDateTimeLocal(event?.startAt ?? defaultStart),
      endAt: formatDateTimeLocal(event?.endAt ?? defaultEnd),
      allDay: event?.allDay ?? false,
      status: event?.status ?? 'confirmed',
    },
  });

  const memberId = watch('memberId');
  const participantIds = watch('participantIds') ?? [];
  const startAtValue = watch('startAt');
  const endAtValue = watch('endAt');

  useEffect(() => {
    if (!isEditing && !memberId && member?.id) {
      setValue('memberId', member.id, { shouldValidate: true });
    }
  }, [isEditing, memberId, member?.id, setValue]);

  // Verificação de conflito em tempo real
  const checkConflicts = useCallback(async (start: string, end: string, mId: string) => {
    if (!start || !end || !mId) return;
    try {
      const res = await fetch('/api/events/conflicts?' + new URLSearchParams({
        memberId: mId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        ...(event?.id ? { excludeId: event.id } : {}),
      }));
      if (res.ok) {
        const data = await res.json() as { conflicts: ConflictingEvent[] };
        setConflicts(data.conflicts ?? []);
      }
    } catch {
      // Ignora erros de verificação prévia
    }
  }, [event?.id]);

  async function onSubmit(data: EventFormData) {
    if (isEditing && event) {
      await updateEvent.mutateAsync({
        id: event.id,
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        allDay: data.allDay,
        status: data.status,
        participantIds: data.participantIds,
      });
    } else {
      await createEvent.mutateAsync({
        memberId: data.memberId,
        participantIds: data.participantIds,
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        allDay: data.allDay,
        status: data.status,
      });
    }
    onSuccess?.();
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-surface-overlay border border-surface-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-member-blue focus:ring-1 focus:ring-member-blue/30 transition-colors";
  const labelClass = "text-sm font-medium text-text-secondary";
  const errorClass = "text-danger text-xs mt-1";

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      {/* Membro (apenas admin) */}
      {isAdmin && (
        <MemberSelector
          value={memberId}
          onChange={(v) => {
            setValue('memberId', v);
            void checkConflicts(startAtValue, endAtValue, v);
          }}
          members={dbMembers}
          disabled={isEditing}
        />
      )}

      {!isAdmin && errors.memberId && (
        <p className={errorClass}>
          {errors.memberId.message ?? 'Não foi possível identificar seu usuário. Recarregue a página.'}
        </p>
      )}

      {/* Participantes adicionais — admin e member podem usar */}
      {memberId && dbMembers.length > 0 && (
        <ParticipantsSelector
          value={participantIds}
          hostId={memberId}
          members={dbMembers}
          onChange={(ids) => setValue('participantIds', ids)}
          disabled={isEditing && !isAdmin && event?.createdBy !== member?.id}
        />
      )}

      {/* Título */}
      <div className="space-y-1.5">
        <label className={labelClass}>Título</label>
        <input
          {...register('title')}
          placeholder="Ex: Reunião de alinhamento"
          className={cn(inputClass, errors.title && 'border-danger focus:border-danger')}
        />
        {errors.title && <p className={errorClass}>{errors.title.message}</p>}
      </div>

      {/* Data/hora — empilhado em mobile, lado a lado em desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>Início</label>
          <input
            {...register('startAt', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                void checkConflicts(e.target.value, endAtValue, memberId);
              }
            })}
            type="datetime-local"
            className={cn(inputClass, errors.startAt && 'border-danger')}
          />
          {errors.startAt && <p className={errorClass}>{errors.startAt.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Término</label>
          <input
            {...register('endAt', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                void checkConflicts(startAtValue, e.target.value, memberId);
              }
            })}
            type="datetime-local"
            className={cn(inputClass, errors.endAt && 'border-danger')}
          />
          {errors.endAt && <p className={errorClass}>{errors.endAt.message}</p>}
        </div>
      </div>

      {/* Local */}
      <div className="space-y-1.5">
        <label className={labelClass}>Local (opcional)</label>
        <input
          {...register('location')}
          placeholder="Sala de reunião, Google Meet..."
          className={inputClass}
        />
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <label className={labelClass}>Descrição (opcional)</label>
        <textarea
          {...register('description')}
          placeholder="Pauta, link de acesso..."
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <label className={labelClass}>Status</label>
        <select {...register('status')} className={cn(inputClass, 'cursor-pointer')}>
          <option value="confirmed">Confirmado</option>
          <option value="tentative">Provisório</option>
        </select>
      </div>

      {/* Aviso de conflito */}
      <ConflictWarning conflicts={conflicts} />

      {/* Botões */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-surface-border text-text-secondary text-sm font-medium hover:bg-surface-overlay transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-lg bg-member-blue hover:bg-member-blue-dark text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar evento'}
        </button>
      </div>
    </form>
  );
}
