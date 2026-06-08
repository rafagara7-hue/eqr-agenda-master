/**
 * Gerador de VCALENDAR (RFC 5545) — formato .ics consumido por Google Calendar,
 * Apple Calendar, Outlook, etc.
 *
 * Saída texto cru com line-endings CRLF como o RFC exige. Linhas >75 octets são
 * folded com CRLF + espaço (line folding também do RFC).
 *
 * Usado pelo endpoint público /api/calendar/[token].ics — calendar apps puxam
 * essa URL periodicamente e mostram os eventos como subscription read-only.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;          // ISO 8601 UTC
  endAt: string;            // ISO 8601 UTC
  allDay?: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  visibility?: 'public' | 'private';
  createdAt?: string;
  updatedAt?: string;
}

export interface IcsCalendarOptions {
  calendarName: string;       // X-WR-CALNAME (não-RFC mas universalmente aceito)
  calendarDescription?: string;
  events: IcsEvent[];
  productId?: string;         // PRODID — identificador do nosso software
}

const CRLF = '\r\n';
const DEFAULT_PRODID = '-//EQR Capital//EQR Agenda Master//PT-BR';

/**
 * Escapa caracteres especiais do iCalendar TEXT type.
 * RFC 5545 §3.3.11: escapar \ → \\, , → \, , ; → \; e quebra de linha → \n
 */
function escapeText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Line folding RFC 5545 §3.1: linhas > 75 octets quebradas com CRLF + espaço.
 * Usamos comprimento em chars como proxy (não-ASCII pode ficar levemente mais
 * curto, mas calendar apps modernos toleram).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let remaining = line;
  out.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, 74); // 74 + 1 space = 75
    out.push(' ' + chunk);
    remaining = remaining.slice(74);
  }
  return out.join(CRLF);
}

/**
 * Formata ISO 8601 → UTC date-time iCalendar (YYYYMMDDTHHMMSSZ).
 */
function formatUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Formato all-day: VALUE=DATE com YYYYMMDD (sem hora, sem TZ).
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function buildEvent(ev: IcsEvent, dtstamp: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];

  lines.push(`UID:${ev.uid}`);
  lines.push(`DTSTAMP:${dtstamp}`);

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(ev.startAt)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(ev.endAt)}`);
  } else {
    lines.push(`DTSTART:${formatUtc(ev.startAt)}`);
    lines.push(`DTEND:${formatUtc(ev.endAt)}`);
  }

  lines.push(`SUMMARY:${escapeText(ev.title)}`);

  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.location)    lines.push(`LOCATION:${escapeText(ev.location)}`);

  // STATUS — confirmed (padrão), tentative, cancelled
  if (ev.status && ev.status !== 'confirmed') {
    lines.push(`STATUS:${ev.status.toUpperCase()}`);
  } else {
    lines.push('STATUS:CONFIRMED');
  }

  // CLASS — public/private (mapeia visibility)
  lines.push(`CLASS:${ev.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'}`);

  if (ev.createdAt) lines.push(`CREATED:${formatUtc(ev.createdAt)}`);
  if (ev.updatedAt) lines.push(`LAST-MODIFIED:${formatUtc(ev.updatedAt)}`);

  lines.push('END:VEVENT');
  return lines;
}

export function generateIcs(opts: IcsCalendarOptions): string {
  const dtstamp = formatUtc(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${opts.productId ?? DEFAULT_PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
  ];

  if (opts.calendarDescription) {
    lines.push(`X-WR-CALDESC:${escapeText(opts.calendarDescription)}`);
  }

  // Refresh interval hint pros consumers (Google ignora, Apple respeita parcialmente)
  lines.push('X-PUBLISHED-TTL:PT1H');
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H');

  for (const ev of opts.events) {
    lines.push(...buildEvent(ev, dtstamp));
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}
