import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';

export class ConflictService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async detect(memberId: string, eventId: string, startAt: Date, endAt: Date): Promise<string[]> {
    const { data, error } = await this.db
      .from('events')
      .select('id, title, start_at, end_at')
      .eq('member_id', memberId)
      .neq('id', eventId)
      .neq('status', 'cancelled')
      .lt('start_at', endAt.toISOString())
      .gt('end_at', startAt.toISOString());

    if (error) throw new Error(`ConflictService.detect: ${error.message}`);

    const overlapping = data ?? [];

    if (overlapping.length > 0) {
      await this.upsertConflicts(memberId, eventId, startAt, endAt, overlapping);
    }

    return overlapping.map((e) => e.id);
  }

  private async upsertConflicts(
    memberId: string,
    eventId: string,
    startAt: Date,
    endAt: Date,
    overlapping: Array<{ id: string; start_at: string; end_at: string }>
  ): Promise<void> {
    const inserts = overlapping.map((other) => {
      const overlapStart = new Date(Math.max(startAt.getTime(), new Date(other.start_at).getTime()));
      const overlapEnd = new Date(Math.min(endAt.getTime(), new Date(other.end_at).getTime()));

      const [idA, idB] = [eventId, other.id].sort();

      return {
        member_id: memberId,
        event_id_a: idA!,
        event_id_b: idB!,
        overlap_start: overlapStart.toISOString(),
        overlap_end: overlapEnd.toISOString(),
        resolved: false,
      };
    });

    await this.db.from('conflicts').upsert(inserts, {
      onConflict: 'event_id_a,event_id_b',
      ignoreDuplicates: false,
    });
  }

  async resolve(conflictId: string, resolvedBy: string): Promise<void> {
    const { error } = await this.db
      .from('conflicts')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
      .eq('id', conflictId);
    if (error) throw new Error(`ConflictService.resolve: ${error.message}`);
  }

  async getUnresolvedForMember(memberId: string) {
    const { data, error } = await this.db
      .from('conflicts')
      .select('*')
      .eq('member_id', memberId)
      .eq('resolved', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`ConflictService.getUnresolved: ${error.message}`);
    return data ?? [];
  }
}
