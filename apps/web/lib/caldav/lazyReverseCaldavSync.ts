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

// 60s — era 5min (overconservative). Cada sócio tem auth iCloud independente
// (app-password próprio), então hammer-rate é por-sócio. 60s ≈ 1 req/min/sócio
// que iCloud aguenta tranquilo. Sócio sente sync quase-real-time ao abrir
// /calendar.
const THRESHOLD_MS = 60_000;
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

  // Fire-and-forget PARALELO por sócio (cada um tem auth iCloud independente).
  // Dentro de cada sócio mantém sequencial: pull → delete (pull ANTES pra events
  // inbound novos não ficarem expostos a delete acidental).
  // 4 sócios × ~15s sequenciais era ~60s. Agora ~15s (limite do mais lento).
  void Promise.allSettled(
    staleIds.map(async (memberId) => {
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
    })
  );
}
