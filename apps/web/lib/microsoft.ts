import crypto from 'node:crypto';

/**
 * Integração com Microsoft Outlook Calendar via Microsoft Graph API.
 *
 * Fluxo OAuth 2.0 (Microsoft Entra ID / Azure AD):
 *   /api/microsoft/connect    → redireciona para login.microsoftonline.com
 *   /api/microsoft/callback   → recebe ?code, troca por access + refresh token, persiste
 *   /api/microsoft/disconnect → remove a conta vinculada (Microsoft não tem revoke endpoint público)
 *
 * Tokens são criptografados em AES-256-GCM com a env ENCRYPTION_KEY (64 hex chars).
 *
 * Detalhes importantes do Microsoft Graph:
 *  - Refresh tokens são ROTATIVOS: cada uso emite novo refresh_token, precisa persistir.
 *  - access_token expira em ~1h, refresh_token expira em 90 dias (inativo) ou 365 dias (rolling).
 *  - Scope offline_access é obrigatório pra receber refresh_token.
 *  - Para multi-tenant use "common" como tenant; para single tenant use o tenant id da org.
 */

const MS_TENANT = process.env['MICROSOFT_TENANT_ID'] ?? 'common';
const MS_AUTH_URL = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize`;
const MS_TOKEN_URL = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`;
const MS_GRAPH_API = 'https://graph.microsoft.com/v1.0';

const SCOPES = [
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
];

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}

export interface MicrosoftAccountRecord {
  id: string;
  member_id: string;
  provider_email: string;
  calendar_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

// ---------------------------------------------------------------------------
// Criptografia simétrica (AES-256-GCM) — compartilhada com a integração Google
// que existia antes; mantemos pra compatibilidade dos tokens armazenados.
// ---------------------------------------------------------------------------

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY ausente ou inválida (deve ter 64 chars hex = 32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, encB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !encB64) throw new Error('Token criptografado em formato inválido');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

// ---------------------------------------------------------------------------
// OAuth 2.0 — Microsoft Entra ID
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} ausente`);
  return v;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('MICROSOFT_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: requireEnv('MICROSOFT_REDIRECT_URI'),
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    client_id: requireEnv('MICROSOFT_CLIENT_ID'),
    client_secret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    redirect_uri: requireEnv('MICROSOFT_REDIRECT_URI'),
    code,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  });

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Microsoft token exchange falhou (${res.status}): ${txt}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  if (!tok.refresh_token) {
    throw new Error('Microsoft não retornou refresh_token. Garanta que o scope offline_access está incluído.');
  }

  // Decodifica id_token pra extrair email/upn (sem validar assinatura — só leitura).
  let email = '';
  if (tok.id_token) {
    const [, payloadB64] = tok.id_token.split('.');
    if (payloadB64) {
      try {
        const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
          email?: string; preferred_username?: string; upn?: string;
        };
        email = decoded.email ?? decoded.preferred_username ?? decoded.upn ?? '';
      } catch {
        // ignora
      }
    }
  }
  if (!email) {
    // Fallback via Graph /me
    const profile = await fetch(`${MS_GRAPH_API}/me`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (profile.ok) {
      const p = (await profile.json()) as { mail?: string; userPrincipalName?: string };
      email = p.mail ?? p.userPrincipalName ?? '';
    }
  }

  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: new Date(Date.now() + tok.expires_in * 1000),
    email,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const body = new URLSearchParams({
    client_id: requireEnv('MICROSOFT_CLIENT_ID'),
    client_secret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  });
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Microsoft refresh falhou (${res.status}): ${txt}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  // Microsoft rotaciona refresh_token: usa o novo se vier, senão reusa o atual.
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + tok.expires_in * 1000),
  };
}

/**
 * Microsoft Graph não expõe endpoint público de revoke de refresh_token.
 * A revogação real só acontece via portal da conta do usuário.
 * Mantemos a função pra compatibilidade da API com a versão Google,
 * mas é um no-op — o caller deve apenas remover a linha do banco.
 */
export async function revokeRefreshToken(_refreshToken: string): Promise<void> {
  // No-op intencional. Microsoft Graph não tem revoke endpoint público.
  // Limpamos só o registro local (já feito pelo caller).
  return;
}

// ---------------------------------------------------------------------------
// Calendar Events (Microsoft Graph API)
// ---------------------------------------------------------------------------

export interface MicrosoftEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** E-mails de participantes (excluindo o owner). */
  attendees?: string[];
  /** Lembrete em minutos antes do evento. Microsoft suporta apenas 1 reminder por evento. */
  reminders?: Array<{ method: 'popup' | 'email'; minutes: number }>;
}

const DEFAULT_REMINDER_MINUTES = 10;

function toGraphEventBody(ev: MicrosoftEventInput) {
  // Microsoft usa "showAs" pra free/busy + isCancelled bool; não tem o status direto como Google.
  // Mapeamos: confirmed→busy, tentative→tentative, cancelled→não cria (deletar é separado).
  const showAs = ev.status === 'tentative' ? 'tentative' : 'busy';

  const start = ev.allDay
    ? { dateTime: ev.startAt.toISOString().slice(0, 10) + 'T00:00:00', timeZone: 'America/Sao_Paulo' }
    : { dateTime: ev.startAt.toISOString(), timeZone: 'America/Sao_Paulo' };
  const end = ev.allDay
    ? { dateTime: ev.endAt.toISOString().slice(0, 10) + 'T00:00:00', timeZone: 'America/Sao_Paulo' }
    : { dateTime: ev.endAt.toISOString(), timeZone: 'America/Sao_Paulo' };

  // Microsoft suporta apenas 1 reminder. Pega o primeiro popup, senão usa 10min default.
  const popupReminder = ev.reminders?.find((r) => r.method === 'popup');
  const reminderMinutes = popupReminder?.minutes ?? DEFAULT_REMINDER_MINUTES;

  const body: Record<string, unknown> = {
    subject: ev.title,
    body: {
      contentType: 'text',
      content: ev.description ?? '',
    },
    location: ev.location ? { displayName: ev.location } : undefined,
    start,
    end,
    isAllDay: !!ev.allDay,
    showAs,
    reminderMinutesBeforeStart: reminderMinutes,
    isReminderOn: true,
  };

  if (ev.attendees && ev.attendees.length > 0) {
    body['attendees'] = ev.attendees.map((email) => ({
      emailAddress: { address: email, name: email },
      type: 'required',
    }));
  }

  return body;
}

async function withFreshToken<T>(
  account: MicrosoftAccountRecord,
  fn: (accessToken: string) => Promise<T>
): Promise<{
  result: T;
  refreshed: { accessToken: string; refreshToken: string; expiresAt: Date } | null;
}> {
  const refreshTokenPlain = decryptToken(account.refresh_token);
  let accessTokenPlain = decryptToken(account.access_token);
  let refreshed: { accessToken: string; refreshToken: string; expiresAt: Date } | null = null;

  const expired = new Date(account.token_expires_at).getTime() <= Date.now() + 30_000;
  if (expired) {
    refreshed = await refreshAccessToken(refreshTokenPlain);
    accessTokenPlain = refreshed.accessToken;
  }

  try {
    const result = await fn(accessTokenPlain);
    return { result, refreshed };
  } catch (err) {
    if (err instanceof Error && err.message.includes('401') && !refreshed) {
      refreshed = await refreshAccessToken(refreshTokenPlain);
      const result = await fn(refreshed.accessToken);
      return { result, refreshed };
    }
    throw err;
  }
}

async function graphFetch(url: string, opts: RequestInit & { accessToken: string }): Promise<unknown> {
  const { accessToken, ...rest } = opts;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...rest.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface MicrosoftApiResult {
  externalEventId: string;
  refreshed: { accessToken: string; refreshToken: string; expiresAt: Date } | null;
}

export async function createCalendarEvent(
  account: MicrosoftAccountRecord,
  event: MicrosoftEventInput
): Promise<MicrosoftApiResult> {
  const { result, refreshed } = await withFreshToken(account, async (token) => {
    const body = toGraphEventBody(event);
    // Endpoint varia: /me/events (calendário padrão) ou /me/calendars/{id}/events
    const url = account.calendar_id === 'primary' || !account.calendar_id
      ? `${MS_GRAPH_API}/me/events`
      : `${MS_GRAPH_API}/me/calendars/${encodeURIComponent(account.calendar_id)}/events`;
    const out = (await graphFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      accessToken: token,
    })) as { id: string };
    return out.id;
  });
  return { externalEventId: result, refreshed };
}

export async function updateCalendarEvent(
  account: MicrosoftAccountRecord,
  externalEventId: string,
  event: MicrosoftEventInput
): Promise<MicrosoftApiResult> {
  const { result, refreshed } = await withFreshToken(account, async (token) => {
    const body = toGraphEventBody(event);
    const url = `${MS_GRAPH_API}/me/events/${encodeURIComponent(externalEventId)}`;
    const out = (await graphFetch(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
      accessToken: token,
    })) as { id: string };
    return out.id;
  });
  return { externalEventId: result, refreshed };
}

export async function deleteCalendarEvent(
  account: MicrosoftAccountRecord,
  externalEventId: string
): Promise<{ refreshed: { accessToken: string; refreshToken: string; expiresAt: Date } | null }> {
  const { refreshed } = await withFreshToken(account, async (token) => {
    const url = `${MS_GRAPH_API}/me/events/${encodeURIComponent(externalEventId)}`;
    await graphFetch(url, { method: 'DELETE', accessToken: token });
    return null;
  });
  return { refreshed };
}
