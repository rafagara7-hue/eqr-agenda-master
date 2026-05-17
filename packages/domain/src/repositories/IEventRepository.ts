import type { CalendarEvent, CreateEventInput, UpdateEventInput } from '../entities/Event.js';

export interface EventsFilter {
  memberId?: string;
  startAt?: Date;
  endAt?: Date;
  status?: string;
  syncStatus?: string;
}

export interface IEventRepository {
  findById(id: string): Promise<CalendarEvent | null>;
  findByMemberId(memberId: string, filter?: EventsFilter): Promise<CalendarEvent[]>;
  findAll(filter?: EventsFilter): Promise<CalendarEvent[]>;
  findByDateRange(startAt: Date, endAt: Date, memberId?: string): Promise<CalendarEvent[]>;
  create(input: CreateEventInput): Promise<CalendarEvent>;
  update(input: UpdateEventInput): Promise<CalendarEvent>;
  delete(id: string): Promise<void>;
  updateSyncStatus(id: string, syncStatus: string, googleEventId?: string, syncError?: string): Promise<void>;
}
