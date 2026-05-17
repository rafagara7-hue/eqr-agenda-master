import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import type { AuditAction, AuditResourceType } from '@eqr/domain';

interface LogInput {
  actorId: string;
  actorRole: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async log(input: LogInput): Promise<void> {
    const { error } = await this.db.from('audit_logs').insert({
      actor_id: input.actorId,
      actor_role: input.actorRole,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      before_state: (input.beforeState ?? null) as Database['public']['Tables']['audit_logs']['Insert']['before_state'],
      after_state: (input.afterState ?? null) as Database['public']['Tables']['audit_logs']['Insert']['after_state'],
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) {
      console.error('AuditService.log failed:', error.message);
    }
  }
}
