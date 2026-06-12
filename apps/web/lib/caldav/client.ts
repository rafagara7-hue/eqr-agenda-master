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
  code?: 'AUTH_FAILED' | 'NO_CALENDARS' | 'WEB_ONLY_ACCOUNT' | 'NETWORK' | 'UNKNOWN';
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

  // Heurística Web-Only Account: Apple ID criado direto pelo browser
  // (account.apple.com sem device Apple) gera conta "iCloud apenas na web".
  // Essa conta autentica com sucesso em CalDAV (Basic auth passa) mas o
  // servidor não tem calendar provisionado pra ela — fetchCalendars retorna
  // lista vazia. Sintoma: auth OK + zero calendars.
  // É indistinguível server-side de "conta full mas com 0 calendars" (raro),
  // então mostramos mensagem com diagnóstico Web-Only como hipótese principal.
  if (calendars.length === 0) {
    return {
      ok: false,
      error:
        'Auth OK mas nenhum calendar disponível. Provável causa: sua conta Apple é "iCloud apenas na web" (criada via account.apple.com sem device Apple). CalDAV exige conta iCloud completa — faça sign-in com esse Apple ID em algum iPhone/Mac/iPad pelo menos uma vez (Apple promove pra Full automaticamente) e tente novamente.',
      code: 'WEB_ONLY_ACCOUNT',
    };
  }

  // Filtra APENAS coleções que suportam VEVENT (RFC 4791 §5.2.3).
  // Isto exclui coleções VTODO-only como "Lembretes" / "Reminders" / "Tasks"
  // do iCloud, que retornam HTTP 403 em PUT de VEVENT.
  // tsdav expõe `components: string[]` parseado de
  // CALDAV:supported-calendar-component-set. Se vier vazio/ausente, aceita
  // a coleção mas filtra pelo nome como guarda secundária.
  const REMINDER_NAME_BLOCKLIST =
    /^(lembretes?|reminders?|tarefas?|tasks?|to-?dos?|notes?|notas?)$/i;

  const eventCapableCalendars = calendars.filter((c) => {
    const comps = (c as { components?: unknown }).components;
    const supportsVEvent =
      Array.isArray(comps) && comps.length > 0
        ? comps.some((x) => typeof x === 'string' && x.toUpperCase() === 'VEVENT')
        : true; // tsdav não retornou components → não bloqueia por aqui
    const name = typeof c.displayName === 'string' ? c.displayName : '';
    const looksLikeReminders = REMINDER_NAME_BLOCKLIST.test(name.trim());
    return supportsVEvent && !looksLikeReminders;
  });

  if (eventCapableCalendars.length === 0) {
    return {
      ok: false,
      error:
        'Nenhum calendário de eventos encontrado nesta conta iCloud (apenas listas de Lembretes/Tarefas). Verifique se há um calendar como "Casa" ou "Calendário" habilitado em Settings → iCloud → Calendars.',
      code: 'NO_CALENDARS',
    };
  }

  const infos: CalDAVCalendarInfo[] = eventCapableCalendars.map((c) => ({
    url: c.url,
    displayName: typeof c.displayName === 'string' ? c.displayName : 'Calendar',
  }));

  // Dentro do conjunto já filtrado (só VEVENT), prefere nomes conhecidos
  // PT-BR + EN. Se nenhum bater, infos[0] agora é SEGURO (já é VEVENT-capable).
  const PREFERRED_NAME =
    /^(home|calendar|calend[áa]rio|principal|casa|pessoal|trabalho)$/i;
  const primaryByName =
    infos.find((c) => PREFERRED_NAME.test(c.displayName.trim())) ?? infos[0]!;

  return { ok: true, client, calendars: infos, primary: primaryByName };
}

/**
 * Verifica se um VEVENT com determinado UID está REALMENTE na coleção CalDAV.
 * Chamado após PUT pra confirmar persistência — iCloud pode retornar 2xx mas
 * descartar silenciosamente em casos edge (Apple ID com pendência, conta em
 * estado limitado, etc).
 *
 * RETRY com backoff (300ms, 800ms, 2s) pra mitigar read-after-write lag
 * em clusters do iCloud. Se evento sumir definitivamente, retorna false.
 */
async function verifyEventInCalendar(
  client: DAVClient,
  calendarUrl: string,
  uid: string
): Promise<boolean> {
  const delaysMs = [300, 800, 2000]; // tentativas: imediato + 3 retries
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delaysMs[attempt - 1]!));
    }
    try {
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
      const found = objects.some((o) => {
        const data = (o as { data?: string }).data;
        return typeof data === 'string' && data.includes(`UID:${uid}`);
      });
      if (found) return true;
    } catch {
      // Erro de fetch: tenta de novo (rede flaky) até esgotar tentativas
    }
  }
  return false;
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
    })) as unknown as {
      status?: number;
      statusText?: string;
      ok?: boolean;
      headers?: Record<string, string> | Headers;
    };

    // FAIL-CLOSED: se tsdav devolveu Response SEM status numérico,
    // NÃO podemos confirmar que o iCloud aceitou. Antes assumíamos sucesso
    // (return {ok:true}), gravava last_sync_at e mascarava falha silenciosa.
    const status = response?.status;
    if (typeof status !== 'number') {
      return {
        ok: false,
        error: 'tsdav devolveu Response sem status — não é possível confirmar PUT',
      };
    }
    if (status === 409) {
      return updateEvent(client, calendarUrl, uid, icsContent);
    }
    // Também valida response.ok quando presente (defesa em profundidade)
    if (response.ok === false || status < 200 || status >= 300) {
      return {
        ok: false,
        error: `HTTP ${status}${response.statusText ? ` ${response.statusText}` : ''}`,
      };
    }

    // POST-PUT VERIFICATION: confirma que o evento REALMENTE persistiu na
    // coleção. iCloud frequentemente retorna 2xx mas descarta silenciosamente
    // o VEVENT (especialmente em conta com Apple ID pendente ou METHOD que ele
    // não gostou). Fazemos REPORT por UID — se não achar, tratamos como falha.
    const verified = await verifyEventInCalendar(client, calendarUrl, uid);
    if (!verified) {
      return {
        ok: false,
        error: `Post-PUT verification failed: iCloud retornou ${status} mas evento não está na coleção (silent discard provável — Apple ID precisa de atenção ou conta em estado limitado)`,
      };
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
      })) as unknown as { status?: number; statusText?: string; ok?: boolean };
      // FAIL-CLOSED em updateEvent também
      if (typeof r?.status !== 'number') {
        return {
          ok: false,
          error: 'tsdav devolveu Response sem status em UPDATE — não é possível confirmar',
        };
      }
      if (r.ok === false || r.status < 200 || r.status >= 300) {
        return {
          ok: false,
          error: `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`,
        };
      }
      // Post-PUT verification em update path
      const verified = await verifyEventInCalendar(client, calendarUrl, uid);
      if (!verified) {
        return {
          ok: false,
          error: `Post-PUT verification falhou em UPDATE: iCloud retornou ${r.status} mas evento sumiu da coleção`,
        };
      }
      return { ok: true };
    }
    // Não achou — cria novo
    const r = (await client.createCalendarObject({
      calendar: { url: calendarUrl },
      filename: `${uid}.ics`,
      iCalString: icsContent,
    })) as unknown as { status?: number; statusText?: string; ok?: boolean };
    if (typeof r?.status !== 'number') {
      return {
        ok: false,
        error: 'tsdav devolveu Response sem status em CREATE fallback — não é possível confirmar',
      };
    }
    if (r.ok === false || r.status < 200 || r.status >= 300) {
      return {
        ok: false,
        error: `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`,
      };
    }
    // Post-PUT verification em create-fallback path
    const verified = await verifyEventInCalendar(client, calendarUrl, uid);
    if (!verified) {
      return {
        ok: false,
        error: `Post-PUT verification falhou em CREATE fallback: iCloud retornou ${r.status} mas evento não está na coleção`,
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
