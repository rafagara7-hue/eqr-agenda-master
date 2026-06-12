/**
 * Lazy trigger pro reverse-sync CalDAV → EQR (delete detection).
 *
 * Mesmo padrão do lazyIcalSync: dispara fire-and-forget quando alguém abre
 * /calendar, com throttle in-memory (5min por memberId). O throttle é
 * best-effort em serverless (Vercel cold starts reset o Map), mas evita
 * hammer dentro de um container quente.
 *
 * Cron /api/cron/sync-ical roda como baseline a cada 6h (ver vercel.json).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { reverseSyncDeletesForMember } from './reverseSyncDeletes';
import { pullInboundFromCaldavForMember } from './pullInboundFromCaldav';

type ServiceDb = SupabaseClient<Database>;

const THRESHOLD_MS = 5 * 60_000; // 5min
const lastRunByMember = new Map<string, number>();

function isStale(memberId: string): boolean {
  const last = lastRunByMember.get(memberId) ?? 0;
  return Date.now() - last >= THRESHOLD_MS;
}

/**
 * Dispara reverse-sync pra UM member específico se está stale.
 * Retorna imediatamente (fire-and-forget no background).
 */
export function triggerLazyReverseSyncForMember(
  db: ServiceDb,
  memberId: string
): void {
  if (!isStale(memberId)) return;
  lastRunByMember.set(memberId, Date.now());
  void reverseSyncDeletesForMember(db, memberId).catch((err) => {
    console.warn('[lazyReverseCaldavSync] member sync failed', {
      memberId,
      error: err instanceof Error ? err.message : err,
    });
  });
}

/**
 * Dispara reverse-sync pra TODOS members com CalDAV verificado que estão stale.
 * Sequencial em background pra não burstar iCloud.
 */
export async function triggerLazyReverseSyncForAll(db: ServiceDb): Promise<void> {
  const { data: rawConns } = await db
    .from('caldav_connections')
    .select('member_id')
    .not('verified_at', 'is', null);
  const allIds = ((rawConns ?? []) as Array<{ member_id: string }>).map((c) => c.member_id);

  const staleIds = allIds.filter((id) => isStale(id));
  if (staleIds.length === 0) return;

  // Marca como rodado ANTES de disparar — evita concurrent triggers do mesmo
  // member quando 2 abas abrem /calendar ao mesmo tempo.
  const now = Date.now();
  for (const id of staleIds) lastRunByMember.set(id, now);

  // Fire-and-forget sequencial. ORDEM: pull inbound ANTES do reverse-delete
  // pra que events inbound novos não fiquem expostos a delete acidental.
  void (async () => {
    for (const memberId of staleIds) {
      try {
        await pullInboundFromCaldavForMember(db, memberId);
      } catch (err) {
        console.warn('[lazyReverseCaldavSync] inbound pull failed', {
          memberId,
          error: err instanceof Error ? err.message : err,
        });
      }
      try {
        await reverseSyncDeletesForMember(db, memberId);
      } catch (err) {
        console.warn('[lazyReverseCaldavSync] reverse-delete failed', {
          memberId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  })();
}
