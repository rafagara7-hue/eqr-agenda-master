import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';

type NotificationType = Database['public']['Tables']['notifications']['Row']['type'];

interface NotifyInput {
  memberId: string;
  type: NotificationType;
  title: string;
  body?: string;
  eventId?: string;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async notify(input: NotifyInput): Promise<void> {
    const { error } = await this.db.from('notifications').insert({
      member_id: input.memberId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      event_id: input.eventId ?? null,
      metadata: (input.metadata ?? {}) as Database['public']['Tables']['notifications']['Insert']['metadata'],
    });
    if (error) console.error('NotificationService.notify failed:', error.message);
  }

  async markRead(notificationId: string): Promise<void> {
    await this.db
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
  }

  async markAllRead(memberId: string): Promise<void> {
    await this.db
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('member_id', memberId)
      .eq('read', false);
  }
}
