/**
 * Helpers de formatacao de data/hora para o modulo de reunioes.
 * Sempre em America/Sao_Paulo (uso corporativo EQR).
 */

export const MEETING_TZ = 'America/Sao_Paulo';
export const MEETING_LOCALE = 'pt-BR';

export function formatMeetingDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString(MEETING_LOCALE, {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: MEETING_TZ,
  });
}

export function formatMeetingTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString(MEETING_LOCALE, {
    hour: '2-digit', minute: '2-digit', timeZone: MEETING_TZ,
  });
}

export function formatMeetingDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(MEETING_LOCALE, {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: MEETING_TZ,
  });
}

export function formatMeetingDateLong(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(MEETING_LOCALE, {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: MEETING_TZ,
  });
}

/** Retorna "há 5min", "há 2h", "há 3d". Granularidade relativa em pt-BR. */
export function meetingTimeAgo(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return formatMeetingDateShort(date);
}

/** "HOJE" / "AMANHÃ" / "QUA 04/06" — usado em listas curtas. */
export function meetingDateRelativeLabel(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'HOJE';
  if (target.getTime() === tomorrow.getTime()) return 'AMANHÃ';
  return formatMeetingDateShort(d).toUpperCase();
}
