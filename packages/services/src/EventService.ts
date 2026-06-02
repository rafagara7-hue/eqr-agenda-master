import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from '@eqr/domain';
import { EventRepository } from '@eqr/database';
import { ConflictService } from './ConflictService';
import { AuditService } from './AuditService';

interface EventServiceDeps {
  db: SupabaseClient<Database>;
  actorId: string;
  actorRole: string;
  ipAddress?: string;
  userAgent?: string;
}

export class EventService {
  private readonly events: EventRepository;
  private readonly conflicts: ConflictService;
  private readonly audit: AuditService;
  private readonly actorId: string;
  private readonly actorRole: string;
  private readonly ipAddress: string | undefined;
  private readonly userAgent: string | undefined;

  constructor({ db, actorId, actorRole, ipAddress, userAgent }: EventServiceDeps) {
    this.events = new EventRepository(db);
    this.conflicts = new ConflictService(db);
    this.audit = new AuditService(db);
    this.actorId = actorId;
    this.actorRole = actorRole;
    this.ipAddress = ipAddress;
    this.userAgent = userAgent;
  }

  async create(input: CreateEventInput): Promise<{ event: CalendarEvent; hasConflict: boolean }> {
    const event = await this.events.create({ ...input, createdBy: this.actorId });

    const conflictingIds = await this.detectConflictsForAllParticipants(event);

    await this.audit.log({
      actorId: this.actorId,
      actorRole: this.actorRole,
      action: 'event.create',
      resourceType: 'event',
      resourceId: event.id,
      afterState: event as unknown as Record<string, unknown>,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
    });

    return { event, hasConflict: conflictingIds.length > 0 };
  }

  private async detectConflictsForAllParticipants(event: CalendarEvent): Promise<string[]> {
    const allConflicts = new Set<string>();
    for (const participantId of event.participantIds) {
      const ids = await this.conflicts.detect(participantId, event.id, event.startAt, event.endAt);
      for (const id of ids) allConflicts.add(id);
    }
    return Array.from(allConflicts);
  }

  async update(input: UpdateEventInput): Promise<{ event: CalendarEvent; hasConflict: boolean }> {
    const before = await this.events.findById(input.id);
    const event = await this.events.update(input);

    const conflictingIds = await this.detectConflictsForAllParticipants(event);

    await this.audit.log({
      actorId: this.actorId,
      actorRole: this.actorRole,
      action: 'event.update',
      resourceType: 'event',
      resourceId: event.id,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: event as unknown as Record<string, unknown>,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
    });

    return { event, hasConflict: conflictingIds.length > 0 };
  }

  async delete(id: string): Promise<void> {
    const before = await this.events.findById(id);
    await this.events.delete(id);

    await this.audit.log({
      actorId: this.actorId,
      actorRole: this.actorRole,
      action: 'event.delete',
      resourceType: 'event',
      resourceId: id,
      beforeState: before as unknown as Record<string, unknown>,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
    });
  }

  async getByDateRange(startAt: Date, endAt: Date, memberId?: string): Promise<CalendarEvent[]> {
    return this.events.findByDateRange(startAt, endAt, memberId);
  }

  async getById(id: string): Promise<CalendarEvent | null> {
    return this.events.findById(id);
  }

  async applyInboundSync(externalEventId: string, memberId: string, data: CreateEventInput): Promise<CalendarEvent> {
    const existing = await this.events.findAll({ memberId, syncStatus: 'synced' });
    const match = existing.find((e) => e.externalEventId === externalEventId);

    if (match) {
      const { event } = await this.update({ id: match.id, ...data });
      return event;
    }

    const { event } = await this.create({ ...data, memberId });
    return event;
  }
}
