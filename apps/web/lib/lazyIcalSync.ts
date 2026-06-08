/**
 * Lazy iCal sync — dispara fetch+upsert sob demanda quando alguém abre uma
 * página relevante. Throttle pra não hammerar feed externo: só re-sincroniza
 * se ultima sync foi > THRESHOLD_MIN minutos atrás.
 *
 * Roda assíncrono (fire-and-forget). Page render NÃO espera o resultado —
 * próximo refresh (ou Next.js revalidação) vai mostrar os dados atualizados.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { syncIcalToEvents } from './microsoftIcal';

type ServiceDb = SupabaseClient<Database>;

const THRESHOLD_MS = 5 * 60_000; // 5min

/**
 * Pra um member específico: dispara sync se calendar externo está stale.
 * Retorna imediatamente (não bloqueia render).
 */
export async function triggerLazyResyncForMember(
  db: ServiceDb,
  memberId: string
): Promise<void> {
  const { data } = await db
    .from('calendar_provider_accounts')
    .select('member_id, ical_url, last_synced_at')
    .eq('member_id', memberId)
    .not('ical_url', 'is', null)
    .eq('sync_enabled', true)
    .maybeSingle();

  const row = data as { member_id: string; ical_url: string; last_synced_at: string | null } | null;
  if (!row || !row.ical_url) return;

  if (isStale(row.last_synced_at)) {
    // Fire-and-forget — não await
    void syncIcalToEvents(db, { memberId: row.member_id, icalUrl: row.ical_url })
      .catch((err) => {
        console.warn('[lazyIcalSync] member sync failed', { memberId, error: err instanceof Error ? err.message : err });
      });
  }
}

/**
 * Pra todos members com calendar externo: dispara sync nos que estão stale.
 * Usado em páginas admin (dashboard, /calendar) onde o user quer ver tudo
 * atualizado.
 *
 * Sequencial pra evitar pico de requests externos. Throttle por row.
 */
export async function triggerLazyResyncForAll(db: ServiceDb): Promise<void> {
  const { data } = await db
    .from('calendar_provider_accounts')
    .select('member_id, ical_url, last_synced_at')
    .not('ical_url', 'is', null)
    .eq('sync_enabled', true);

  const rows = (data ?? []) as Array<{
    member_id: string;
    ical_url: string;
    last_synced_at: string | null;
  }>;

  const stale = rows.filter((r) => isStale(r.last_synced_at));
  if (stale.length === 0) return;

  // Fire-and-forget — roda em background, render NÃO espera
  void (async () => {
    for (const r of stale) {
      try {
        await syncIcalToEvents(db, { memberId: r.member_id, icalUrl: r.ical_url });
      } catch (err) {
        console.warn('[lazyIcalSync] all sync failed', {
          memberId: r.member_id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  })();
}

function isStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  const last = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last > THRESHOLD_MS;
}
