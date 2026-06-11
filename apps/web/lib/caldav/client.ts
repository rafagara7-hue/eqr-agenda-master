/**
 * CalDAV client pra push de events pro iCloud Calendar dos sócios.
 *
 * Stack:
 *   - `tsdav` (Node.js CalDAV client, suporta Apple iCloud)
 *   - Auth: Basic com Apple ID + app-specific password
 *   - Server: caldav.icloud.com
 *
 * Fluxo típico:
 *   1. connect(email, appPassword) → valida credenciais + descobre calendars
 *   2. discoverPrimaryCalendar(client) → escolhe o "Home" ou primeiro disponível
 *   3. pushEvent(client, calendarUrl, ics, uid) → cria/atualiza evento
 *   4. deleteEvent(client, calendarUrl, uid) → remove evento
 *
 * Falhas tratadas:
 *   - Senha inválida → erro 401 do iCloud
 *   - Sem 2FA configurado → erro guidance
 *   - Network → timeout claro
 *
 * Nota sobre app-specific password:
 *   Apple não suporta OAuth pra CalDAV. Sócio gera password em
 *   appleid.apple.com → "Sign-In and Security" → "App-Specific Passwords".
 *   Esse password só funciona pra CalDAV (não pra login Apple normal),
 *   limitando risco se vazar.
 */

import { createDAVClient, type DAVClient, type DAVCalendar } from 'tsdav';

const ICLOUD_SERVER = 'https://caldav.icloud.com';

export interface CalDAVCredentials {
  appleIdEmail: string;
  appPassword: string;
}

export interface CalDAVCalendarInfo {
  url: string;
  displayName: string;
}

export interface CalDAVConnectResult {
  ok: true;
  client: DAVClient;
  calendars: CalDAVCalendarInfo[];
  primary: CalDAVCalendarInfo;
}

export interface CalDAVError {
  ok: false;
  error: string;
  code?: 'AUTH_FAILED' | 'NO_CALENDARS' | 'NETWORK' | 'UNKNOWN';
}

/**
 * Cria cliente CalDAV e valida credenciais conectando ao iCloud.
 * Retorna lista de calendars disponíveis + sugestão de primary.
 */
export async function connectCalDAV(
  creds: CalDAVCredentials
): Promise<CalDAVConnectResult | CalDAVError> {
  let client: DAVClient;
  try {
    client = await createDAVClient({
      serverUrl: ICLOUD_SERVER,
      credentials: {
        username: creds.appleIdEmail,
        password: creds.appPassword,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao conectar CalDAV';
    if (/401|unauthorized|auth/i.test(msg)) {
      return {
        ok: false,
        error: 'Credenciais inválidas. Verifique o Apple ID e a app-specific password.',
        code: 'AUTH_FAILED',
      };
    }
    if (/timeout|network|ECONNREFUSED/i.test(msg)) {
      return {
        ok: false,
        error: 'Sem conexão com iCloud. Tente novamente em alguns segundos.',
        code: 'NETWORK',
      };
    }
    return { ok: false, error: msg, code: 'UNKNOWN' };
  }

  // Descobre calendars do user
  let calendars: DAVCalendar[];
  try {
    calendars = await client.fetchCalendars();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao listar calendars';
    return { ok: false, error: msg, code: 'UNKNOWN' };
  }

  if (calendars.length === 0) {
    return {
      ok: false,
      error: 'Nenhum calendar encontrado na conta iCloud.',
      code: 'NO_CALENDARS',
    };
  }

  const infos: CalDAVCalendarInfo[] = calendars.map((c) => ({
    url: c.url,
    displayName: typeof c.displayName === 'string' ? c.displayName : 'Calendar',
  }));

  // Escolhe calendar padrão: prefere "Home" / "Calendar" / "Calendário"
  const primaryByName =
    infos.find((c) =>
      /^(home|calendar|calend[áa]rio|principal)$/i.test(c.displayName)
    ) ?? infos[0]!;

  return { ok: true, client, calendars: infos, primary: primaryByName };
}

/**
 * Push de event pro calendar do user via CalDAV PUT.
 *
 * @param uid UID estável do event (será o nome do arquivo .ics no calendar)
 * @param icsContent VCALENDAR completo gerado por generateMeetingIcs
 */
export async function pushEvent(
  client: DAVClient,
  calendarUrl: string,
  uid: string,
  icsContent: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // ATENÇÃO: tsdav.createCalendarObject NÃO lança em 4xx/5xx — retorna o
    // Response object com .status/.statusText/.ok. Comentário antigo "tsdav
    // lança em 4xx/5xx" era ENGANOSO e mascarava falhas (last_sync_at era
    // gravado mesmo quando iCloud rejeitava o PUT). Validamos status aqui.
    const response = (await client.createCalendarObject({
      calendar: { url: calendarUrl },
      filename: `${uid}.ics`,
      iCalString: icsContent,
    })) as unknown as { status?: number; statusText?: string; ok?: boolean };

    const status = response?.status;
    if (typeof status === 'number') {
      if (status === 409) {
        return updateEvent(client, calendarUrl, uid, icsContent);
      }
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          error: `HTTP ${status}${response.statusText ? ` ${response.statusText}` : ''}`,
        };
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro CalDAV PUT';
    if (/409|conflict|already exists/i.test(msg)) {
      return updateEvent(client, calendarUrl, uid, icsContent);
    }
    return { ok: false, error: msg };
  }
}

/**
 * Atualiza event existente. CalDAV usa PUT no mesmo path; semanticamente
 * é create-or-update.
 */
export async function updateEvent(
  client: DAVClient,
  calendarUrl: string,
  uid: string,
  icsContent: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // tsdav updateCalendarObject precisa da etag — buscamos o object primeiro
    const objects = await client.fetchCalendarObjects({
      calendar: { url: calendarUrl },
      filters: [
        {
          'comp-filter': {
            _attributes: { name: 'VCALENDAR' },
            'comp-filter': {
              _attributes: { name: 'VEVENT' },
              'prop-filter': {
                _attributes: { name: 'UID' },
                'text-match': { _text: uid },
              },
            },
          },
        },
      ],
    });
    const existing = objects.find((o) => o.url.endsWith(`${uid}.ics`));
    if (existing) {
      const r = (await client.updateCalendarObject({
        calendarObject: { ...existing, data: icsContent },
      })) as unknown as { status?: number; statusText?: string };
      if (typeof r?.status === 'number' && (r.status < 200 || r.status >= 300)) {
        return {
          ok: false,
          error: `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`,
        };
      }
      return { ok: true };
    }
    // Não achou — cria novo
    const r = (await client.createCalendarObject({
      calendar: { url: calendarUrl },
      filename: `${uid}.ics`,
      iCalString: icsContent,
    })) as unknown as { status?: number; statusText?: string };
    if (typeof r?.status === 'number' && (r.status < 200 || r.status >= 300)) {
      return {
        ok: false,
        error: `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro CalDAV UPDATE',
    };
  }
}

/**
 * Deleta event do calendar.
 */
export async function deleteEvent(
  client: DAVClient,
  calendarUrl: string,
  uid: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const objects = await client.fetchCalendarObjects({
      calendar: { url: calendarUrl },
    });
    const existing = objects.find((o) => o.url.endsWith(`${uid}.ics`));
    if (!existing) {
      return { ok: true }; // não existe, considera sucesso
    }
    await client.deleteCalendarObject({ calendarObject: existing });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro CalDAV DELETE',
    };
  }
}
