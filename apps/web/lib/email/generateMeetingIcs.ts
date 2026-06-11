/**
 * Gerador de VCALENDAR (RFC 5545 + RFC 5546) pra meeting invite.
 *
 * Princípios:
 *   - METHOD:REQUEST sinaliza pro cliente "isso é convite, mostre Accept/Decline"
 *   - ORGANIZER deve bater com o email FROM (senão Outlook desconfia e suprime UI)
 *   - ATTENDEE precisa incluir o destinatário (Apple Mail só mostra Accept se for attendee)
 *   - Datas em UTC com sufixo Z (timezone explícito; evita ambiguidade)
 *   - Sem extensões proprietárias X-MICROSOFT-* (Apple Mail tem bug com algumas)
 *   - Line folding RFC 5545 §3.1 (max 75 octetos por linha)
 *   - UID estável (clientes deduplicam pelo UID)
 *
 * Campos extras adicionados pra melhor compatibilidade:
 *   - CREATED: quando event foi criado (Outlook quer)
 *   - LAST-MODIFIED: quando foi atualizado (Outlook quer pra updates)
 *   - TRANSP:OPAQUE: bloqueia o tempo no calendar (default mas explícito)
 *   - PRIORITY: prioridade do evento (5 = normal)
 *
 * Compatibilidade validada:
 *   - Outlook desktop (Word renderer): mostra toolbar Accept/Decline
 *   - Outlook web: mesmo
 *   - Apple Mail (macOS/iOS): banner "Add to Calendar" + Accept/Decline
 *   - Gmail: extrai evento, oferece "Add to Google Calendar"
 *   - Webmail meuemail: mostra anexo .ics baixável
 */

export interface MeetingInviteIcs {
  /** UID estável do evento (ex: "uuid@host"). Clientes deduplicam por isso. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  organizer: { name: string; email: string };
  attendees: Array<{ name?: string | null; email: string; rsvp?: boolean }>;
  /** Status do evento. CONFIRMED é o normal. CANCELLED muda METHOD pra CANCEL. */
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
  /** Sequência — incrementa quando edita um já enviado (RFC 5545 §3.8.7.4). */
  sequence?: number;
  /** Quando o event foi criado originalmente (default: now). */
  createdAt?: Date;
  /** Quando foi atualizado pela última vez (default: now). */
  lastModified?: Date;
  /** URL clicável (ex: link pra abrir reunião no EQR Agenda). */
  url?: string;
}

const CRLF = '\r\n';
const PRODID = '-//EQR Capital//EQR Agenda Master 1.0//PT-BR';

/**
 * Escapa caracteres especiais em TEXT (RFC 5545 §3.3.11).
 * Ordem importa: backslash primeiro, depois ; , \n.
 */
function escText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Sanitiza email: lowercase + trim. Alguns clientes são case-sensitive
 * em comparações mailto:.
 */
function safeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Folding RFC 5545 §3.1: linhas > 75 octetos quebram com CRLF + space.
 * Trabalha em octetos (UTF-8 bytes), não caracteres — importante pra
 * conteúdo com acentos PT-BR.
 */
function fold(line: string): string {
  // Converte pra bytes pra contar octetos
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;

  const dec = new TextDecoder('utf-8');
  const parts: string[] = [];
  let i = 0;
  let chunkSize = 75; // primeira linha sem space prefix
  while (i < bytes.length) {
    // Pega até `chunkSize` bytes, mas garante que não corta no meio de char UTF-8
    let end = Math.min(i + chunkSize, bytes.length);
    // Reverte se o último byte é continuation byte (10xxxxxx)
    while (end > i && (bytes[end - 1]! & 0xc0) === 0x80) end--;
    parts.push(dec.decode(bytes.slice(i, end)));
    i = end;
    chunkSize = 74; // próximas linhas com 1 byte de space prefix → 74 livres
  }
  return parts.join(CRLF + ' ');
}

/** Date → "YYYYMMDDTHHMMSSZ" (UTC, RFC 5545 §3.3.5 form #2). */
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
  if (invite.endAt.getTime() <= invite.startAt.getTime()) {
    throw new Error('generateMeetingIcs: endAt deve ser depois de startAt');
  }
  if (!invite.uid) {
    throw new Error('generateMeetingIcs: uid é obrigatório');
  }
  if (!invite.organizer?.email) {
    throw new Error('generateMeetingIcs: organizer.email é obrigatório');
  }

  const now = new Date();
  const dtstamp = utc(now);
  const created = utc(invite.createdAt ?? now);
  const lastModified = utc(invite.lastModified ?? now);
  const status = invite.status ?? 'CONFIRMED';
  const method = status === 'CANCELLED' ? 'CANCEL' : 'REQUEST';
  const sequence = invite.sequence ?? 0;

  const organizerEmail = safeEmail(invite.organizer.email);
  const organizerName = invite.organizer.name?.trim() || invite.organizer.email;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `DTSTAMP:${dtstamp}`,
    `CREATED:${created}`,
    `LAST-MODIFIED:${lastModified}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${utc(invite.startAt)}`,
    `DTEND:${utc(invite.endAt)}`,
    `SUMMARY:${escText(invite.title)}`,
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
    'PRIORITY:5',
    'CLASS:PUBLIC',
    `ORGANIZER;CN="${escText(organizerName)}":mailto:${organizerEmail}`,
  ];

  if (invite.description) lines.push(`DESCRIPTION:${escText(invite.description)}`);
  if (invite.location) lines.push(`LOCATION:${escText(invite.location)}`);
  if (invite.url) lines.push(`URL:${invite.url}`);

  // Attendees — cada um vira uma ATTENDEE line
  for (const a of invite.attendees) {
    if (!a.email) continue;
    const email = safeEmail(a.email);
    const params: string[] = [];
    if (a.name) params.push(`CN="${escText(a.name)}"`);
    params.push('CUTYPE=INDIVIDUAL');
    params.push('ROLE=REQ-PARTICIPANT');
    params.push(status === 'CANCELLED' ? 'PARTSTAT=DECLINED' : 'PARTSTAT=NEEDS-ACTION');
    if (a.rsvp !== false && status !== 'CANCELLED') params.push('RSVP=TRUE');
    lines.push(`ATTENDEE;${params.join(';')}:mailto:${email}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join(CRLF) + CRLF;
}
