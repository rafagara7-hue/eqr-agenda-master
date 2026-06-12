/**
 * Reverse sync CalDAV → EQR: detecta events que o sócio deletou no Apple
 * Calendar (CalDAV) e remove do EQR Agenda.
 *
 * Estratégia:
 *  1. Conecta CalDAV do sócio e lista TODOS objects do calendar primary
 *  2. Filtra só events EQR pelo UID pattern `<eventId>@<host>` — ignora lunches
 *     pessoais do sócio
 *  3. Compara conjunto Apple vs conjunto DB (events com member_id = sócio)
 *  4. Diff (em DB ∧ ¬ em Apple) → candidatos a deletar
 *  5. Sanity check: se Apple retornou 0 events EQR mas DB tem events,
 *     ABORTA (provavelmente erro de conexão, não delete real)
 *  6. Grace period 15min via events.created_at — evita race com push em flight
 *  7. Hard delete (consistente com regra atual: criador/dono apaga definitivo)
 *
 * Notificação: silenciosa por design. Inserção de audit row em notifications
 * é opcional (skip V1; reverter é trivial olhando logs).
 *
 * Limitação: V1 não detecta EDIÇÃO (título/horário). Sócio que edita no Apple
 * precisa replicar no EQR. Filosofia "EQR é source-of-truth" preservada — só
 * deleção é "remoção de ruído", não mutação de dado canônico.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { decrypt } from '@/lib/email/cryptoUtil';
import { connectCalDAV } from './client';

type ServiceDb = SupabaseClient<Database>;

// 3min — antes era 15min (overconservative). Com post-PUT verification, sabemos
// que o evento ESTÁ em Apple no momento do push. Único risco residual é read
// replica lag do iCloud (<1s tipicamente). 3min cobre folgadamente + permite
// testes rápidos de delete reverso.
const GRACE_PERIOD_MS = 3 * 60_000;

interface CaldavConnRow {
  id: string;
  member_id: string;
  apple_id_email: string;
  app_password_encrypted: string;
  calendar_url: string | null;
  verified_at: string | null;
}

export interface ReverseSyncResult {
  memberId: string;
  appleEventsFound: number;
  candidates: number;
  deleted: number;
  skipped: number;
  reason?: string;
}

/**
 * Roda o reverse-sync pra UM member específico.
 * Não throw: erros viram reason no result.
 */
export async function reverseSyncDeletesForMember(
  serviceDb: ServiceDb,
  memberId: string
): Promise<ReverseSyncResult> {
  // 1. Busca conexão CalDAV verificada
  const { data: rawConn } = await serviceDb
    .from('caldav_connections')
    .select('id, member_id, apple_id_email, app_password_encrypted, calendar_url, verified_at')
    .eq('member_id', memberId)
    .maybeSingle();
  const conn = rawConn as CaldavConnRow | null;
  if (!conn || !conn.verified_at || !conn.calendar_url) {
    return {
      memberId,
      appleEventsFound: 0,
      candidates: 0,
      deleted: 0,
      skipped: 0,
      reason: 'no-verified-connection',
    };
  }

  // 2. Conecta iCloud CalDAV
  let appPassword: string;
  try {
    appPassword = decrypt(conn.app_password_encrypted);
  } catch (err) {
    return {
      memberId,
      appleEventsFound: 0,
      candidates: 0,
      deleted: 0,
      skipped: 0,
      reason: `decrypt-failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const connResult = await connectCalDAV({
    appleIdEmail: conn.apple_id_email,
    appPassword,
  });
  if (!connResult.ok) {
    return {
      memberId,
      appleEventsFound: 0,
      candidates: 0,
      deleted: 0,
      skipped: 0,
      reason: `connect-failed: ${connResult.error}`,
    };
  }

  // 3. Lista todos calendar objects do calendar primary
  let objects: Array<{ data?: string; url?: string }> = [];
  try {
    const raw = await connResult.client.fetchCalendarObjects({
      calendar: { url: conn.calendar_url },
    });
    objects = raw as Array<{ data?: string; url?: string }>;
  } catch (err) {
    return {
      memberId,
      appleEventsFound: 0,
      candidates: 0,
      deleted: 0,
      skipped: 0,
      reason: `fetch-failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Filtra só events EQR pelo UID pattern `<eventId>@<host>`
  const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';
  const escapedHost = host.replace(/\./g, '\\.');
  // RFC 5545 pode foldar linhas (CRLF + space). Match permissivo: UID: + qualquer
  // coisa não-espaço até @host.
  const uidPattern = new RegExp(`UID:\\s*([^\\s\\r\\n]+?)@${escapedHost}`, 'i');
  const eqrEventIdsInApple = new Set<string>();
  for (const obj of objects) {
    const data = obj.data;
    if (typeof data !== 'string') continue;
    // Unfold linhas RFC 5545 (CRLF + WSP → unidos)
    const unfolded = data.replace(/\r?\n[ \t]/g, '');
    const m = unfolded.match(uidPattern);
    if (m && m[1]) eqrEventIdsInApple.add(m[1]);
  }

  // 5. Busca events do member no DB, fora do grace period.
  // DEFENSE-IN-DEPTH: explicitamente exclui Apple-sourced events (managed
  // exclusively by pullInboundFromCaldav, não pelo reverse-delete que opera
  // sobre events EQR-canônicos). UID pattern já filtra na prática mas explicit
  // > implicit.
  const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();
  const { data: dbEvents } = await serviceDb
    .from('events')
    .select('id, title, created_at, external_provider')
    .eq('member_id', memberId)
    .lt('created_at', graceCutoff)
    .or('external_provider.is.null,external_provider.neq.apple_caldav');
  const dbEventsList = (dbEvents ?? []) as Array<{
    id: string;
    title: string;
    created_at: string;
    external_provider: string | null;
  }>;

  // 6. Diff: em DB ∧ ¬ em Apple = candidatos a delete
  const candidates = dbEventsList.filter((e) => !eqrEventIdsInApple.has(e.id));

  // 7. Sanity check: se Apple retornou 0 events EQR mas DB tinha events, é
  // ALMOST CERTAMENTE erro de conexão (não delete real). Aborta pra evitar
  // mass-delete catastrófico.
  if (eqrEventIdsInApple.size === 0 && candidates.length > 0) {
    return {
      memberId,
      appleEventsFound: 0,
      candidates: candidates.length,
      deleted: 0,
      skipped: candidates.length,
      reason: 'sanity-check-aborted: Apple returned 0 EQR events while DB has events (likely connection issue)',
    };
  }

  // 8. Hard delete dos candidatos — em paralelo (eram sequenciais antes).
  // Cada delete é independente; paraleliza mas usa allSettled pra não cancelar
  // os outros se um falhar.
  const deleteResults = await Promise.allSettled(
    candidates.map(async (c) => {
      const { error } = await serviceDb.from('events').delete().eq('id', c.id);
      if (error) {
        console.warn('[caldav/reverseSync] delete failed', {
          memberId,
          eventId: c.id,
          error: error.message,
        });
        throw new Error(error.message);
      }
      return c.id;
    })
  );
  const deleted = deleteResults.filter((r) => r.status === 'fulfilled').length;

  return {
    memberId,
    appleEventsFound: eqrEventIdsInApple.size,
    candidates: candidates.length,
    deleted,
    skipped: candidates.length - deleted,
  };
}

/**
 * Roda reverse-sync pra TODOS members com CalDAV verificado. Sequencial pra
 * evitar burst de requests no iCloud.
 */
export async function reverseSyncDeletesForAll(
  serviceDb: ServiceDb
): Promise<ReverseSyncResult[]> {
  const { data: rawConns } = await serviceDb
    .from('caldav_connections')
    .select('member_id')
    .not('verified_at', 'is', null);
  const memberIds = ((rawConns ?? []) as Array<{ member_id: string }>).map((c) => c.member_id);

  const results: ReverseSyncResult[] = [];
  for (const memberId of memberIds) {
    try {
      const r = await reverseSyncDeletesForMember(serviceDb, memberId);
      results.push(r);
    } catch (err) {
      results.push({
        memberId,
        appleEventsFound: 0,
        candidates: 0,
        deleted: 0,
        skipped: 0,
        reason: `exception: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return results;
}
