/**
 * Pull inbound do Apple Calendar → EQR.
 *
 * Quando sócio cria event direto no Apple Calendar (não via EQR), esse module
 * importa pra tabela events com external_provider='apple_caldav'. Admin passa
 * a ver TUDO que sócio tem agendado, mesmo eventos pessoais.
 *
 * MULTI-CALENDAR: pull lê de TODAS as coleções VEVENT-capable do iCloud do
 * sócio (Casa, Trabalho, Família, Pessoal, etc), não só da primary. Sócio
 * tem 5-8 coleções tipicamente — todos events visíveis pro admin no EQR.
 *
 * Assimetria pull vs push:
 *   - PULL = espelho de LEITURA completo (todas coleções)
 *   - PUSH = espelho de ESCRITA direcionado (só primary — pra evitar duplicar
 *     events EQR em todas coleções do iCloud)
 *
 * Arquitetura:
 *   1. Lê caldav_connections.verified_at + inbound_sync_enabled
 *   2. Conecta CalDAV e descobre TODAS coleções VEVENT-capable
 *   3. Itera coleções fetchando objects (try/catch granular per-calendar)
 *   4. Parse VEVENT (UID, SUMMARY, DTSTART, DTEND, etc) com unfold RFC 5545
 *   5. SKIP UIDs no padrão EQR (`<uuid>@<host>`) — anti-loop
 *   6. SANITY CHECK: aborta se UNIÃO de todas coleções = 0 events apple mas
 *      DB tem Apple-sourced (provavelmente erro de conexão, não delete real)
 *   7. UPSERT idempotente por (member_id, external_event_id) — UNIQUE index
 *      em migration 0033 garante zero duplicata mesmo se evento estiver em 2
 *      coleções
 *   8. DELETE de Apple-sourced events do DB que sumiram de TODAS as coleções
 *   9. Filtro de janela: só events dos últimos 30 dias + próximos 365 dias
 *
 * Anti-loop:
 *   - Pull SKIP UIDs EQR-format (`<uuid>@<host>`)
 *   - Push detecta external_provider='apple_caldav' e skip
 *   - reverseSyncDeletes filtra .neq('external_provider','apple_caldav')
 *
 * Blocklist de ruído (não bloqueia push, só pull):
 *   - Aniversários (gerado de contatos)
 *   - Feriados (subscrição read-only)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { decrypt } from '@/lib/email/cryptoUtil';
import { connectCalDAV } from './client';

type ServiceDb = SupabaseClient<Database>;

const PULL_WINDOW_PAST_MS = 30 * 24 * 60 * 60_000; // 30 dias atrás
const PULL_WINDOW_FUTURE_MS = 365 * 24 * 60 * 60_000; // 1 ano à frente

interface CaldavConnRow {
  id: string;
  member_id: string;
  apple_id_email: string;
  app_password_encrypted: string;
  calendar_url: string | null;
  verified_at: string | null;
  inbound_sync_enabled: boolean | null;
}

export interface InboundPullResult {
  memberId: string;
  appleEventsFound: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  reason?: string;
}

/**
 * Parse mínimo de VEVENT — extrai campos essenciais sem dependência externa.
 * Implementação alinhada com reverseSyncDeletes.ts (mesmo unfold/regex).
 */
interface ParsedVEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

function unfold(ics: string): string {
  return ics.replace(/\r?\n[ \t]/g, '');
}

function parseICalDate(s: string): { date: Date; allDay: boolean } | null {
  // Formato UTC com Z: YYYYMMDDTHHMMSSZ
  // Formato date-only (all-day): YYYYMMDD
  // Formato local: YYYYMMDDTHHMMSS (sem tz — tratamos como UTC pra simplificar V1)
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  if (!h) {
    // Date-only = all-day. Converte pra 00:00 UTC do dia.
    return { date: new Date(Date.UTC(+y!, +mo! - 1, +d!)), allDay: true };
  }
  return {
    date: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!, +se!)),
    allDay: false,
  };
}

function parseVEvent(vevent: string): ParsedVEvent | null {
  const unfolded = unfold(vevent);
  const uid = unfolded.match(/^UID:\s*(.+)$/im)?.[1]?.trim();
  if (!uid) return null;
  const dtstartRaw = unfolded.match(/^DTSTART(?:;[^:]*)?:\s*(.+)$/im)?.[1]?.trim();
  const dtendRaw = unfolded.match(/^DTEND(?:;[^:]*)?:\s*(.+)$/im)?.[1]?.trim();
  if (!dtstartRaw) return null;
  const dtstart = parseICalDate(dtstartRaw);
  if (!dtstart) return null;
  // DTEND opcional pra all-day; default = start + 1h pra V1
  const dtend = dtendRaw ? parseICalDate(dtendRaw) : null;
  const endDate = dtend?.date ?? new Date(dtstart.date.getTime() + 60 * 60_000);
  const summary = unfolded.match(/^SUMMARY:\s*(.+)$/im)?.[1]?.trim() ?? '(Sem título)';
  const description = unfolded.match(/^DESCRIPTION:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const location = unfolded.match(/^LOCATION:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const statusRaw = unfolded.match(/^STATUS:\s*(.+)$/im)?.[1]?.trim().toUpperCase();
  const status: ParsedVEvent['status'] =
    statusRaw === 'CANCELLED' ? 'cancelled' :
    statusRaw === 'TENTATIVE' ? 'tentative' :
    'confirmed';
  // Desescapa text RFC 5545
  const unescape = (s: string | null) =>
    s?.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\') ?? null;
  return {
    uid,
    summary: unescape(summary) ?? summary,
    description: unescape(description),
    location: unescape(location),
    startAt: dtstart.date,
    endAt: endDate,
    allDay: dtstart.allDay,
    status,
  };
}

export async function pullInboundFromCaldavForMember(
  serviceDb: ServiceDb,
  memberId: string
): Promise<InboundPullResult> {
  // 1. Busca conexão verificada com inbound habilitado
  const { data: rawConn } = await serviceDb
    .from('caldav_connections')
    .select('id, member_id, apple_id_email, app_password_encrypted, calendar_url, verified_at, inbound_sync_enabled')
    .eq('member_id', memberId)
    .maybeSingle();
  const conn = rawConn as CaldavConnRow | null;
  if (!conn || !conn.verified_at || !conn.calendar_url) {
    return { memberId, appleEventsFound: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, reason: 'no-verified-connection' };
  }
  if (conn.inbound_sync_enabled === false) {
    return { memberId, appleEventsFound: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, reason: 'inbound-sync-disabled' };
  }

  // 2. Conecta iCloud
  let appPassword: string;
  try {
    appPassword = decrypt(conn.app_password_encrypted);
  } catch (err) {
    return { memberId, appleEventsFound: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, reason: `decrypt: ${err instanceof Error ? err.message : String(err)}` };
  }
  const connResult = await connectCalDAV({
    appleIdEmail: conn.apple_id_email,
    appPassword,
  });
  if (!connResult.ok) {
    await serviceDb.from('caldav_connections').update({ last_inbound_error: `connect: ${connResult.error}` }).eq('id', conn.id);
    return { memberId, appleEventsFound: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, reason: `connect: ${connResult.error}` };
  }

  // 3. Fetch calendar objects de TODAS coleções VEVENT-capable do iCloud do
  // sócio. Antes lia só conn.calendar_url (primary) — eventos criados em
  // outras coleções (Casa, Trabalho, Família, etc) ficavam invisíveis.
  // connResult.calendars[] já vem filtrado por connectCalDAV (VEVENT-only +
  // anti-Reminders blocklist).
  //
  // Blocklist secundária pra ruído típico (não bloqueia push, só pull):
  // - Aniversários (gerado automaticamente de contatos)
  // - Feriados (subscrição read-only do calendário público)
  const NOISE_CALENDAR_BLOCKLIST =
    /^(anivers[áa]rios?|birthdays?|feriados?|holidays?)$/i;

  const calendarsToScan = connResult.calendars.filter(
    (c) => !NOISE_CALENDAR_BLOCKLIST.test((c.displayName ?? '').trim())
  );

  // Sequencial intra-member pra não burstar iCloud com N requests simultâneos
  // do mesmo Apple ID. Inter-member já é paralelo no caller.
  let objects: Array<{ data?: string; url?: string }> = [];
  const perCalendarErrors: string[] = [];
  let calendarsThatSucceeded = 0;
  for (const cal of calendarsToScan) {
    try {
      const raw = await connResult.client.fetchCalendarObjects({
        calendar: { url: cal.url },
      });
      objects = objects.concat(raw as Array<{ data?: string; url?: string }>);
      calendarsThatSucceeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Erro em UMA coleção não aborta as outras (log no last_inbound_error).
      perCalendarErrors.push(`${cal.displayName ?? cal.url}: ${msg.slice(0, 200)}`);
      console.warn('[caldav/pull] per-calendar fetch failed', {
        memberId,
        calendar: cal.displayName,
        error: msg,
      });
    }
  }

  // Se TODAS coleções falharam, aborta. Mantém last_inbound_error pra debug.
  if (calendarsThatSucceeded === 0 && calendarsToScan.length > 0) {
    const allErrors = perCalendarErrors.join(' | ');
    await serviceDb.from('caldav_connections').update({
      last_inbound_error: `all-calendars-failed: ${allErrors.slice(0, 500)}`
    }).eq('id', conn.id);
    return { memberId, appleEventsFound: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, reason: 'all-calendars-failed' };
  }

  // 4. Parse VEVENTs + filter window + SKIP EQR-canonical (anti-loop)
  const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';
  const escapedHost = host.replace(/\./g, '\\.');
  const EQR_UID_PATTERN = new RegExp(`^[a-f0-9-]+@${escapedHost}$`, 'i');
  const now = Date.now();
  const windowStart = now - PULL_WINDOW_PAST_MS;
  const windowEnd = now + PULL_WINDOW_FUTURE_MS;

  const appleEvents: ParsedVEvent[] = [];
  for (const obj of objects) {
    const data = obj.data;
    if (typeof data !== 'string') continue;
    // ICS pode ter múltiplos VEVENTs (recorrentes + exceptions); V1 pega o primeiro
    const veventMatch = data.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
    if (!veventMatch) continue;
    const parsed = parseVEvent(veventMatch[0]);
    if (!parsed) continue;
    // Anti-loop: skip events EQR-canonical (UID em formato `<uuid>@host`)
    if (EQR_UID_PATTERN.test(parsed.uid)) continue;
    // Filter window
    if (parsed.endAt.getTime() < windowStart) continue;
    if (parsed.startAt.getTime() > windowEnd) continue;
    appleEvents.push(parsed);
  }

  // 5. SANITY CHECK: aborta se 0 events apple-sourced mas DB tem
  const { data: existingDb } = await serviceDb
    .from('events')
    .select('id, external_event_id')
    .eq('member_id', memberId)
    .eq('external_provider', 'apple_caldav');
  const existing = (existingDb ?? []) as Array<{ id: string; external_event_id: string | null }>;
  if (appleEvents.length === 0 && existing.length > 0) {
    await serviceDb.from('caldav_connections').update({
      last_inbound_error: 'sanity-check-aborted: Apple returned 0 events while DB has Apple-sourced events',
    }).eq('id', conn.id);
    return {
      memberId,
      appleEventsFound: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skipped: existing.length,
      reason: 'sanity-check-aborted',
    };
  }

  // 6. UPSERT por (member_id, external_event_id)
  let inserted = 0;
  let updated = 0;
  const existingByUid = new Map<string, string>();
  for (const e of existing) {
    if (e.external_event_id) existingByUid.set(e.external_event_id, e.id);
  }

  for (const ev of appleEvents) {
    const existingId = existingByUid.get(ev.uid);
    if (existingId) {
      const { error: updErr } = await serviceDb.from('events').update({
        title: ev.summary,
        description: ev.description,
        location: ev.location,
        start_at: ev.startAt.toISOString(),
        end_at: ev.endAt.toISOString(),
        all_day: ev.allDay,
        status: ev.status,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existingId);
      if (!updErr) updated++;
    } else {
      const { error: insErr } = await serviceDb.from('events').insert({
        member_id: memberId,
        created_by: memberId,
        title: ev.summary,
        description: ev.description,
        location: ev.location,
        start_at: ev.startAt.toISOString(),
        end_at: ev.endAt.toISOString(),
        all_day: ev.allDay,
        status: ev.status,
        visibility: 'private',
        external_event_id: ev.uid,
        external_provider: 'apple_caldav',
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      });
      if (!insErr) inserted++;
    }
  }

  // 7. DELETE de Apple-sourced events que sumiram do Apple
  const appleUidSet = new Set(appleEvents.map((e) => e.uid));
  const toDelete = existing.filter((e) => e.external_event_id && !appleUidSet.has(e.external_event_id));
  let deleted = 0;
  if (toDelete.length > 0) {
    const ids = toDelete.map((e) => e.id);
    const { error: delErr } = await serviceDb.from('events').delete().in('id', ids);
    if (!delErr) deleted = ids.length;
  }

  // 8. Atualiza cursor + clear error
  await serviceDb.from('caldav_connections').update({
    last_inbound_pull_at: new Date().toISOString(),
    last_inbound_error: null,
  }).eq('id', conn.id);

  return {
    memberId,
    appleEventsFound: appleEvents.length,
    inserted,
    updated,
    deleted,
    skipped: 0,
  };
}

/**
 * Roda pullInboundFromCaldav pra todos members com CalDAV verified +
 * inbound_sync_enabled. PARALELO via Promise.allSettled — cada sócio tem
 * auth iCloud independente, então 4 conns concorrentes não burstam ninguém.
 */
export async function pullInboundFromCaldavForAll(
  serviceDb: ServiceDb
): Promise<InboundPullResult[]> {
  const { data: rawConns } = await serviceDb
    .from('caldav_connections')
    .select('member_id')
    .not('verified_at', 'is', null)
    .eq('inbound_sync_enabled', true);
  const memberIds = ((rawConns ?? []) as Array<{ member_id: string }>).map((c) => c.member_id);

  const settled = await Promise.allSettled(
    memberIds.map((memberId) => pullInboundFromCaldavForMember(serviceDb, memberId))
  );

  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      memberId: memberIds[i]!,
      appleEventsFound: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      reason: `exception: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`,
    };
  });
}
