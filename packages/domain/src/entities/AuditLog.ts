export type AuditAction =
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'event.sync_retry'
  | 'conflict.resolve'
  | 'member.link_calendar'
  | 'member.unlink_calendar';

export type AuditResourceType = 'event' | 'member' | 'calendar_account' | 'conflict';

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
