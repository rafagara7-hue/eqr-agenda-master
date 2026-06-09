/**
 * Gerador de VCALENDAR pra meeting INVITE (RFC 5545 com METHOD:REQUEST).
 *
 * Diferença vs subscription publish:
 *   - METHOD:REQUEST → email client mostra "Aceitar/Recusar/Talvez"
 *   - ATTENDEE com RSVP=TRUE → calendar app espera resposta
 *   - ORGANIZER → quem fez o convite
 *
 * Compatibilidade testada:
 *   - Apple Mail (iOS + macOS): aceita/recusa via botão nativo
 *   - Outlook (web + desktop): mesmo
 *   - Gmail: extrai evento, oferece adicionar ao Google Calendar
 *   - Outros clientes IMAP simples: anexo .ics baixável
 *
 * Caveats pra evitar o problema que Kadu reportou:
 *   - NÃO usa extensões Microsoft proprietárias (X-MICROSOFT-*)
 *   - Timezone explícito em DTSTART/DTEND como UTC (Z suffix)
 *   - Line folding RFC 5545 (75 chars max + CRLF + space)
 *   - UID estável baseado em event id
 */

export interface MeetingInviteIcs {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  organizer: { name: string; email: string };
  attendees: Array<{ name?: string; email: string; rsvp?: boolean }>;
  /** Status do evento. CONFIRMED é o normal pra invite. CANCELLED notifica cancelamento. */
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
  /** Sequência do evento — incrementa quando edita um já enviado (RFC 5545). */
  sequence?: number;
  /** URL clicável (ex: link pra abrir reunião no EQR Agenda). */
  url?: string;
}

const CRLF = '\r\n';
const PRODID = '-//EQR Capital//EQR Agenda Master//PT-BR';

/** Escapa caracteres especiais TEXT (RFC 5545 §3.3.11). */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folding RFC 5545 §3.1 — quebra linhas > 75 chars com CRLF + space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let rem = line.slice(75);
  while (rem.length > 0) {
    out.push(' ' + rem.slice(0, 74));
    rem = rem.slice(74);
  }
  return out.join(CRLF);
}

/** Date → "YYYYMMDDTHHMMSSZ" (UTC). */
function utc(d: Date): string {
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

export function generateMeetingIcs(invite: MeetingInviteIcs): string {
  const dtstamp = utc(new Date());
  const status = invite.status ?? 'CONFIRMED';
  const method = status === 'CANCELLED' ? 'CANCEL' : 'REQUEST';
  const sequence = invite.sequence ?? 0;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${utc(invite.startAt)}`,
    `DTEND:${utc(invite.endAt)}`,
    `SUMMARY:${esc(invite.title)}`,
    `STATUS:${status}`,
    `ORGANIZER;CN=${esc(invite.organizer.name)}:mailto:${invite.organizer.email}`,
  ];

  if (invite.description) lines.push(`DESCRIPTION:${esc(invite.description)}`);
  if (invite.location)    lines.push(`LOCATION:${esc(invite.location)}`);
  if (invite.url)         lines.push(`URL:${invite.url}`);

  // Attendees — cada um vira ATTENDEE line
  for (const a of invite.attendees) {
    const params: string[] = [];
    if (a.name) params.push(`CN=${esc(a.name)}`);
    params.push('CUTYPE=INDIVIDUAL');
    params.push('ROLE=REQ-PARTICIPANT');
    params.push('PARTSTAT=NEEDS-ACTION');
    if (a.rsvp !== false) params.push('RSVP=TRUE');
    lines.push(`ATTENDEE;${params.join(';')}:mailto:${a.email}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join(CRLF) + CRLF;
}
