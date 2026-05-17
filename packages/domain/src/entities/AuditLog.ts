export type AuditAction =
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'event.sync_retry'
  | 'conflict.resolve'
  | 'member.link_google'
  | 'member.unlink_google';

export type AuditResourceType = 'event' | 'member' | 'google_account' | 'conflict';

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
