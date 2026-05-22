export type EventStatus = 'confirmed' | 'tentative';
export type EventVisibility = 'public' | 'private';
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';

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
  googleEventId: string | null;
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
