/**
 * Sync read-only do Outlook Calendar via iCal subscription URL.
 *
 * Complementa apps/web/lib/microsoftSync.ts (OAuth bidirecional). Aqui:
 *  - Sócio publica calendar no Outlook Web → recebe URL pública (.ics)
 *  - URL é salva em calendar_provider_accounts.ical_url
 *  - Cron a cada 30min refaz fetch + upsert dos eventos na tabela `events`
 *  - Read-only: eventos criados no EQR Agenda NÃO vão pro Outlook
 *
 * Quando OAuth completo estiver disponível (tenant configurado + envs),
 * o sócio pode "upgrade" pra OAuth — apaga a row iCal, autentica via OAuth.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';

type ServiceDb = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Validação de URL — aceita qualquer URL HTTPS que sirva iCal/.ics
// (Google Calendar, Apple iCloud, Outlook.com, Outlook corporativo, etc.)
// ---------------------------------------------------------------------------

const KNOWN_ICAL_HOSTS = [
  // Google Calendar
  'calendar.google.com',
  // Apple iCloud
  'p01-caldav.icloud.com', 'p02-caldav.icloud.com', 'p03-caldav.icloud.com',
  'p04-caldav.icloud.com', 'p05-caldav.icloud.com',
  // Microsoft Outlook (corporativo + pessoal)
  'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
  // Genericos que muitos providers usam
] as const;

/**
 * Aceita qualquer URL HTTPS. Validação real (é .ics mesmo?) acontece no fetch
 * — só confirmamos VCALENDAR no corpo. Aqui só barramos esquemas perigosos
 * (file://, javascript:) e URLs claramente lixo.
 *
 * Mantemos export `isValidOutlookIcalUrl` como alias por compat até remover
 * referências antigas.
 */
export function isValidIcalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  // Só HTTPS (HTTP seria leak de credentials embutidas em URLs Google/Apple)
  if (parsed.protocol !== 'https:') return false;
  // Bloqueia loopback/private (evita SSRF pra metadata internas)
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '169.254.169.254' // AWS/GCP metadata
  ) {
    return false;
  }
  return true;
}

// Alias mantido pra compatibilidade — DEPRECATED, use isValidIcalUrl.
export const isValidOutlookIcalUrl = isValidIcalUrl;

/**
 * Detecta qual provedor pela URL (só pra UX/labels — não muda comportamento).
 */
export function detectIcalProvider(url: string): 'google' | 'apple' | 'outlook' | 'other' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('google.com')) return 'google';
    if (host.endsWith('icloud.com')) return 'apple';
    if (host.endsWith('outlook.com') || host.endsWith('office.com') || host.endsWith('office365.com')) return 'outlook';
    return 'other';
  } catch {
    return 'other';
  }
}

// ---------------------------------------------------------------------------
// Parser iCal (RFC 5545) — implementação mínima sem dependência externa
// ---------------------------------------------------------------------------

export interface IcalEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

function unfoldLines(rawIcal: string): string[] {
  // RFC 5545: linhas que começam com espaço ou tab são continuação da anterior
  const lines = rawIcal.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseIcalDate(value: string, isDate: boolean): Date {
  // VALUE=DATE → YYYYMMDD (all-day)
  // YYYYMMDDTHHMMSSZ → UTC
  // YYYYMMDDTHHMMSS → floating local
  if (isDate || /^\d{8}$/.test(value)) {
    const y = parseInt(value.slice(0, 4), 10);
    const m = parseInt(value.slice(4, 6), 10) - 1;
    const d = parseInt(value.slice(6, 8), 10);
    return new Date(Date.UTC(y, m, d));
  }
  // YYYYMMDDTHHMMSS[Z]
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!match) return new Date(value);
  const [, y, mo, d, h, mi, s, z] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z === 'Z' ? 'Z' : ''}`;
  return new Date(iso);
}

function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseIcal(rawIcal: string): IcalEvent[] {
  const lines = unfoldLines(rawIcal);
  const events: IcalEvent[] = [];

  let inVevent = false;
  let current: Partial<IcalEvent> & { allDay?: boolean } = {};

  for (const rawLine of lines) {
    if (rawLine === 'BEGIN:VEVENT') {
      inVevent = true;
      current = { allDay: false };
      continue;
    }
    if (rawLine === 'END:VEVENT') {
      if (
        inVevent &&
        current.uid &&
        current.summary &&
        current.start instanceof Date &&
        current.end instanceof Date
      ) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          description: current.description ?? null,
          location: current.location ?? null,
          start: current.start,
          end: current.end,
          allDay: !!current.allDay,
          status: current.status ?? 'confirmed',
        });
      }
      inVevent = false;
      continue;
    }
    if (!inVevent) continue;

    // Linha: NAME[;PARAM=val]:VALUE
    const colonIdx = rawLine.indexOf(':');
    if (colonIdx < 0) continue;
    const left = rawLine.slice(0, colonIdx);
    const value = rawLine.slice(colonIdx + 1);
    const [name, ...paramParts] = left.split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }

    const upperName = name.toUpperCase();
    if (upperName === 'UID') current.uid = value;
    else if (upperName === 'SUMMARY') current.summary = unescapeIcalText(value);
    else if (upperName === 'DESCRIPTION') current.description = unescapeIcalText(value);
    else if (upperName === 'LOCATION') current.location = unescapeIcalText(value);
    else if (upperName === 'DTSTART') {
      const isDate = params['VALUE'] === 'DATE';
      current.start = parseIcalDate(value, isDate);
      if (isDate) current.allDay = true;
    } else if (upperName === 'DTEND') {
      const isDate = params['VALUE'] === 'DATE';
      current.end = parseIcalDate(value, isDate);
    } else if (upperName === 'STATUS') {
      const s = value.toUpperCase();
      if (s === 'CANCELLED') current.status = 'cancelled';
      else if (s === 'TENTATIVE') current.status = 'tentative';
      else current.status = 'confirmed';
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Fetch + sync
// ---------------------------------------------------------------------------

export type IcalFetchResult =
  | { ok: true; events: IcalEvent[] }
  | { ok: false; error: string; status?: number };

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — proteção contra payload abusivo

export async function fetchIcal(url: string): Promise<IcalFetchResult> {
  if (!isValidIcalUrl(url)) {
    return { ok: false, error: 'URL inválida — precisa ser https://...' };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EQR-Agenda-Master/1.0 (iCal subscriber)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}`, status: res.status };
    }
    // Limita tamanho da resposta pra evitar DOS via iCal gigante
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_ICAL_SIZE_BYTES) {
      return { ok: false, error: `iCal muito grande (${contentLength} bytes)` };
    }
    const text = await res.text();
    if (text.length > MAX_ICAL_SIZE_BYTES) {
      return { ok: false, error: 'iCal excedeu tamanho máximo' };
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      return { ok: false, error: 'Resposta não é um arquivo iCal válido' };
    }
    const events = parseIcal(text);
    return { ok: true, events };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Timeout após ${FETCH_TIMEOUT_MS / 1000}s — feed Outlook não respondeu`
          : err.message
        : 'Erro de rede';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sincroniza eventos do iCal pra tabela `events` do EQR Agenda.
 *
 * Estratégia:
 *  - Cada evento iCal vira/atualiza uma row em `events` com:
 *    - external_event_id = uid do iCal
 *    - external_provider = 'microsoft' (mesma string do OAuth)
 *    - sync_status = 'synced'
 *    - created_by = memberId (sócio dono)
 *  - Eventos sumindo do iCal são marcados sync_status='local_only' (reconciliação
 *    pós-loop), refletindo que a fonte sumiu. Não deletamos — preservamos histórico.
 *  - Eventos com end<=start são corrigidos no parser (end = start + 1min) pra
 *    não violar CHECK constraint `end_at > start_at` de events.
 *  - Erros de DB são logados via console.error pra observabilidade.
 *  - Não cruzamos com eventos criados manualmente no EQR (uid iCal nunca colide).
 */
export async function syncIcalToEvents(
  db: ServiceDb,
  opts: { memberId: string; icalUrl: string }
): Promise<{ ok: true; synced: number; errors: number } | { ok: false; error: string }> {
  const fetched = await fetchIcal(opts.icalUrl);
  if (!fetched.ok) return { ok: false, error: fetched.error };

  let synced = 0;
  let errors = 0;
  const seenUids = new Set<string>();

  for (const ev of fetched.events) {
    seenUids.add(ev.uid);
    try {
      // Garante end > start (CHECK constraint de events) — soma 1min se igual/inválido
      const startMs = ev.start.getTime();
      let endMs = ev.end.getTime();
      if (!Number.isFinite(endMs) || endMs <= startMs) {
        endMs = startMs + 60_000;
      }

      // Upsert por external_event_id + member_id
      const existing = await db
        .from('events')
        .select('id')
        .eq('member_id', opts.memberId)
        .eq('external_event_id', ev.uid)
        .eq('external_provider', 'microsoft')
        .maybeSingle();

      const payload = {
        member_id: opts.memberId,
        created_by: opts.memberId,
        title: ev.summary,
        description: ev.description,
        location: ev.location,
        start_at: ev.start.toISOString(),
        end_at: new Date(endMs).toISOString(),
        all_day: ev.allDay,
        status: ev.status,
        external_event_id: ev.uid,
        external_provider: 'microsoft' as const,
        sync_status: 'synced' as const,
        sync_error: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let dbErr: { message: string } | null = null;
      if (existing.data) {
        const { error } = await db.from('events').update(payload).eq('id', (existing.data as { id: string }).id);
        dbErr = error;
      } else {
        const { error } = await db.from('events').insert(payload);
        dbErr = error;
      }
      if (dbErr) {
        console.error('[ical sync] upsert error', { uid: ev.uid, member: opts.memberId, error: dbErr.message });
        errors++;
      } else {
        synced++;
      }
    } catch (err) {
      console.error('[ical sync] exception', { uid: ev.uid, member: opts.memberId, error: err instanceof Error ? err.message : err });
      errors++;
    }
  }

  // Reconciliação: eventos previamente synced que sumiram do feed → local_only.
  // Cumpre o contrato do JSDoc e evita "eventos fantasma" pra sócios.
  if (seenUids.size > 0) {
    try {
      const { data: tracked } = await db
        .from('events')
        .select('id, external_event_id')
        .eq('member_id', opts.memberId)
        .eq('external_provider', 'microsoft')
        .eq('sync_status', 'synced');
      const trackedRows = (tracked ?? []) as Array<{ id: string; external_event_id: string | null }>;
      const orphanIds = trackedRows
        .filter((r) => r.external_event_id && !seenUids.has(r.external_event_id))
        .map((r) => r.id);
      if (orphanIds.length > 0) {
        const { error } = await db
          .from('events')
          .update({
            sync_status: 'local_only',
            sync_error: 'Evento removido do feed Outlook',
            updated_at: new Date().toISOString(),
          })
          .in('id', orphanIds);
        if (error) {
          console.error('[ical sync] orphan reconcile error', { member: opts.memberId, error: error.message });
        }
      }
    } catch (err) {
      console.error('[ical sync] orphan reconcile exception', { member: opts.memberId, error: err instanceof Error ? err.message : err });
    }
  }

  return { ok: true, synced, errors };
}

/**
 * Roda sync de TODOS os membros que tem ical_url configurado.
 * Usado pelo cron de Vercel a cada 30min.
 */
export async function syncAllIcalSubscriptions(db: ServiceDb): Promise<{
  ok: true;
  processed: number;
  totalSynced: number;
  totalErrors: number;
}> {
  const { data: rows } = await db
    .from('calendar_provider_accounts')
    .select('member_id, ical_url')
    .not('ical_url', 'is', null)
    .eq('sync_enabled', true);

  const accounts = (rows ?? []) as Array<{ member_id: string; ical_url: string }>;

  let totalSynced = 0;
  let totalErrors = 0;

  // Sequencial pra evitar rate limits Microsoft. 5 sócios = ~5 segundos.
  for (const acc of accounts) {
    const result = await syncIcalToEvents(db, {
      memberId: acc.member_id,
      icalUrl: acc.ical_url,
    });
    if (result.ok) {
      totalSynced += result.synced;
      totalErrors += result.errors;
    } else {
      totalErrors++;
    }
  }

  return {
    ok: true,
    processed: accounts.length,
    totalSynced,
    totalErrors,
  };
}
