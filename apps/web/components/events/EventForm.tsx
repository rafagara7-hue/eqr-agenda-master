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
import { useTranslation } from '@/lib/i18n';
import type { CalendarEvent } from '@eqr/domain';

const reminderEntrySchema = z.object({
  method: z.enum(['popup', 'email']),
  minutes: z.number().int().min(0).max(40320),
});

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
  reminders: z.array(reminderEntrySchema).max(5).default([{ method: 'popup', minutes: 10 }]),
}).refine((d) => new Date(d.startAt) < new Date(d.endAt), {
  message: 'O término deve ser após o início',
  path: ['endAt'],
});

const REMINDER_TIME_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'Na hora' },
  { minutes: 5, label: '5 minutos antes' },
  { minutes: 10, label: '10 minutos antes' },
  { minutes: 15, label: '15 minutos antes' },
  { minutes: 30, label: '30 minutos antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 120, label: '2 horas antes' },
  { minutes: 1440, label: '1 dia antes' },
  { minutes: 2880, label: '2 dias antes' },
];

const REMINDER_METHOD_OPTIONS: Array<{ value: 'popup' | 'email'; label: string }> = [
  { value: 'popup', label: 'Notificação' },
  { value: 'email', label: 'E-mail' },
];

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
  const { t } = useTranslation();

  const { data: dbMembers = [] } = useQuery<MemberOption[]>({
    queryKey: ['members-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, color_hex, avatar_url')
        .eq('is_active', true)
        .neq('slug', 'admin')
        .neq('slug', 'external')
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
  const initialReminders = event?.reminders && event.reminders.length > 0
    ? event.reminders
    : [{ method: 'popup' as const, minutes: 10 }];

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
      reminders: initialReminders,
    },
  });

  const memberId = watch('memberId');
  const participantIds = watch('participantIds') ?? [];
  const startAtValue = watch('startAt');
  const endAtValue = watch('endAt');
  const reminders = watch('reminders') ?? [];

  function updateReminder(index: number, patch: Partial<{ method: 'popup' | 'email'; minutes: number }>) {
    const next = reminders.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setValue('reminders', next, { shouldValidate: true });
  }

  function removeReminder(index: number) {
    const next = reminders.filter((_, i) => i !== index);
    setValue('reminders', next, { shouldValidate: true });
  }

  function addReminder() {
    if (reminders.length >= 5) return;
    // Sugere o próximo "step" que ainda não foi usado, ou 10 min por padrão
    const usedMinutes = new Set(reminders.map((r) => r.minutes));
    const suggested = REMINDER_TIME_OPTIONS.find((o) => !usedMinutes.has(o.minutes))?.minutes ?? 10;
    setValue('reminders', [...reminders, { method: 'popup', minutes: suggested }], { shouldValidate: true });
  }

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
    const startDate = new Date(data.startAt);
    const now = new Date();

    // Confirma se o horário é passado. Em edição, só pergunta se a data mudou
    // (não incomoda quando o user só ajusta título de evento antigo).
    const startChanged = !event || startDate.getTime() !== event.startAt.getTime();
    if (startDate.getTime() < now.getTime() && startChanged) {
      const fmt = startDate.toLocaleString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const ok = window.confirm(
        `O horário escolhido (${fmt}) já passou. Deseja registrar este evento mesmo assim?`
      );
      if (!ok) return;
    }

    if (isEditing && event) {
      await updateEvent.mutateAsync({
        id: event.id,
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: startDate,
        endAt: new Date(data.endAt),
        allDay: data.allDay,
        status: data.status,
        participantIds: data.participantIds,
        reminders: data.reminders,
      });
    } else {
      await createEvent.mutateAsync({
        memberId: data.memberId,
        participantIds: data.participantIds,
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: startDate,
        endAt: new Date(data.endAt),
        allDay: data.allDay,
        status: data.status,
        reminders: data.reminders,
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
        <label className={labelClass}>{t('event.title')}</label>
        <input
          {...register('title')}
          placeholder={t('event.titlePlaceholder')}
          className={cn(inputClass, errors.title && 'border-danger focus:border-danger')}
        />
        {errors.title && <p className={errorClass}>{errors.title.message}</p>}
      </div>

      {/* Data/hora — empilhado em mobile, lado a lado em desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>{t('event.start')}</label>
          <input
            {...register('startAt', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const newStartStr = e.target.value;
                // Auto-ajusta o término preservando a duração atual.
                // Ex: tinha 16:00-17:00 (1h) e troca o início pra 14:00 → vira 14:00-15:00.
                if (newStartStr && startAtValue && endAtValue) {
                  const oldStart = new Date(startAtValue).getTime();
                  const oldEnd = new Date(endAtValue).getTime();
                  const duration = oldEnd - oldStart;
                  if (Number.isFinite(duration) && duration > 0) {
                    const newStart = new Date(newStartStr).getTime();
                    const newEndDate = new Date(newStart + duration);
                    const newEndStr = formatDateTimeLocal(newEndDate);
                    setValue('endAt', newEndStr, { shouldValidate: true });
                    void checkConflicts(newStartStr, newEndStr, memberId);
                    return;
                  }
                }
                void checkConflicts(newStartStr, endAtValue, memberId);
              }
            })}
            type="datetime-local"
            className={cn(inputClass, errors.startAt && 'border-danger')}
          />
          {errors.startAt && <p className={errorClass}>{errors.startAt.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>{t('event.end')}</label>
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
        <label className={labelClass}>{t('event.location')} ({t('common.optional')})</label>
        <input
          {...register('location')}
          placeholder={t('event.locationPlaceholder')}
          className={inputClass}
        />
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t('event.description')} ({t('common.optional')})</label>
        <textarea
          {...register('description')}
          placeholder=""
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t('event.status')}</label>
        <select {...register('status')} className={cn(inputClass, 'cursor-pointer')}>
          <option value="confirmed">{t('event.status.confirmed')}</option>
          <option value="tentative">{t('event.status.tentative')}</option>
        </select>
      </div>

      {/* Lembretes: como e quando avisar antes do evento */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={labelClass}>{t('event.reminders')}</label>
          {reminders.length < 5 && (
            <button
              type="button"
              onClick={addReminder}
              className="text-xs font-medium text-member-blue hover:underline"
            >
              + {t('event.addReminder')}
            </button>
          )}
        </div>
        {reminders.length === 0 ? (
          <p className="text-text-muted text-xs italic">
            {t('event.noReminders')}
          </p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <select
                  value={r.method}
                  onChange={(e) => updateReminder(i, { method: e.target.value as 'popup' | 'email' })}
                  className={cn(inputClass, 'cursor-pointer flex-shrink-0 w-32 sm:w-36')}
                >
                  {REMINDER_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={r.minutes}
                  onChange={(e) => updateReminder(i, { minutes: parseInt(e.target.value, 10) })}
                  className={cn(inputClass, 'cursor-pointer flex-1 min-w-0')}
                >
                  {REMINDER_TIME_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeReminder(i)}
                  aria-label={t('event.removeReminder')}
                  className="p-2 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-text-muted text-[11px]">
          {t('event.reminderHint')}
        </p>
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
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-lg bg-member-blue hover:bg-member-blue-dark text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? t('common.saving') : isEditing ? t('event.saveChanges') : t('event.create')}
        </button>
      </div>
    </form>
  );
}
