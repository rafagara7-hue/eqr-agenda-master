export type EventStatus = 'confirmed' | 'tentative';
export type EventVisibility = 'public' | 'private';
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';

export type ReminderMethod = 'popup' | 'email';

/** Lembrete customizado do evento: notificação X minutos antes do start. */
export interface EventReminder {
  method: ReminderMethod;
  minutes: number;
}

export interface RecurrenceRule {
  id: string;
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: Date;
  rruleString?: string;
  createdAt: Date;
}

export type EventParticipantRole = 'owner' | 'participant';

export interface EventParticipant {
  memberId: string;
  role: EventParticipantRole;
  canEdit: boolean;
}

export interface CalendarEvent {
  id: string;
  memberId: string;
  participantIds: string[];
  participants: EventParticipant[];
  reminders: EventReminder[];
  createdBy: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status: EventStatus;
  visibility: EventVisibility;
  recurrenceId: string | null;
  recurrenceExceptionDate: Date | null;
  isRecurrenceRoot: boolean;
  /** ID do evento no calendário externo (Google ou Microsoft). Use `externalProvider` pra saber qual. */
  externalEventId: string | null;
  /** Provider do calendário externo onde o evento foi sincronizado. */
  externalProvider: 'google' | 'microsoft' | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: Date | null;
  colorOverride: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventInput {
  memberId: string;
  /** IDs adicionais de participantes (sem o owner — ele é sempre adicionado automaticamente). */
  participantIds?: string[];
  /** Se true, participants extras recebem can_edit=true (default false). */
  participantsCanEdit?: boolean;
  /** Lembretes customizados; se undefined, app aplica default (popup 10min + email 60min). */
  reminders?: EventReminder[];
  createdBy: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  status?: EventStatus;
  recurrenceId?: string;
  colorOverride?: string;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  id: string;
}
