import crypto from 'node:crypto';

/**
 * Integração com Google Calendar API via REST.
 *
 * Fluxo OAuth 2.0:
 *   /api/google/connect  → redireciona para Google com scope calendar
 *   /api/google/callback → recebe ?code, troca por access + refresh token, persiste
 *   /api/google/disconnect → revoga token e remove conta
 *
 * Tokens são criptografados em AES-256-GCM com a env ENCRYPTION_KEY (64 hex chars).
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}

export interface GoogleAccountRecord {
  id: string;
  member_id: string;
  google_email: string;
  calendar_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

// ---------------------------------------------------------------------------
// Helpers de criptografia simétrica (AES-256-GCM)
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
// OAuth flow
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} ausente`);
  return v;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token exchange falhou (${res.status}): ${txt}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
  };

  if (!tok.refresh_token) {
    throw new Error(
      'Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente novamente.'
    );
  }

  // Decodifica id_token só pra pegar o email (sem validar assinatura — só leitura)
  let email = '';
  if (tok.id_token) {
    const [, payloadB64] = tok.id_token.split('.');
    if (payloadB64) {
      try {
        const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { email?: string };
        email = decoded.email ?? '';
      } catch {
        // ignora
      }
    }
  }
  if (!email) {
    const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (profile.ok) {
      const p = (await profile.json()) as { email?: string };
      email = p.email ?? '';
    }
  }

  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: new Date(Date.now() + tok.expires_in * 1000),
    email,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google refresh falhou (${res.status}): ${txt}`);
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: tok.access_token,
    expiresAt: new Date(Date.now() + tok.expires_in * 1000),
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

// ---------------------------------------------------------------------------
// Sync de evento (Calendar API)
// ---------------------------------------------------------------------------

export interface GoogleEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** E-mails Google de participantes (excluindo o owner). O Google envia convite/cancelamento pra cada um. */
  attendees?: string[];
}

/** Lembretes default aplicados a todo evento criado pelo app. */
const DEFAULT_REMINDERS = {
  useDefault: false,
  overrides: [
    { method: 'popup', minutes: 10 },
    { method: 'email', minutes: 60 },
  ],
};

function toGoogleEventBody(ev: GoogleEventInput) {
  const start = ev.allDay
    ? { date: ev.startAt.toISOString().slice(0, 10) }
    : { dateTime: ev.startAt.toISOString(), timeZone: 'America/Sao_Paulo' };
  const end = ev.allDay
    ? { date: ev.endAt.toISOString().slice(0, 10) }
    : { dateTime: ev.endAt.toISOString(), timeZone: 'America/Sao_Paulo' };
  const body: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    status: ev.status === 'cancelled' ? 'cancelled' : ev.status === 'tentative' ? 'tentative' : 'confirmed',
    start,
    end,
    reminders: DEFAULT_REMINDERS,
  };
  if (ev.attendees && ev.attendees.length > 0) {
    body['attendees'] = ev.attendees.map((email) => ({ email }));
    body['guestsCanInviteOthers'] = false;
    body['guestsCanModify'] = false;
  }
  return body;
}

async function withFreshToken<T>(
  account: GoogleAccountRecord,
  fn: (accessToken: string) => Promise<T>
): Promise<{ result: T; refreshed: { accessToken: string; expiresAt: Date } | null }> {
  const refreshTokenPlain = decryptToken(account.refresh_token);
  let accessTokenPlain = decryptToken(account.access_token);
  let refreshed: { accessToken: string; expiresAt: Date } | null = null;

  const expired = new Date(account.token_expires_at).getTime() <= Date.now() + 30_000;
  if (expired) {
    refreshed = await refreshAccessToken(refreshTokenPlain);
    accessTokenPlain = refreshed.accessToken;
  }

  try {
    const result = await fn(accessTokenPlain);
    return { result, refreshed };
  } catch (err) {
    // Tenta um refresh extra se 401
    if (err instanceof Error && err.message.includes('401') && !refreshed) {
      refreshed = await refreshAccessToken(refreshTokenPlain);
      const result = await fn(refreshed.accessToken);
      return { result, refreshed };
    }
    throw err;
  }
}

async function googleFetch(url: string, opts: RequestInit & { accessToken: string }): Promise<unknown> {
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
    throw new Error(`Google API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface GoogleApiResult {
  googleEventId: string;
  refreshed: { accessToken: string; expiresAt: Date } | null;
}

// sendUpdates=all → Google envia email aos guests em create/update/delete
const SEND_UPDATES = 'sendUpdates=all';

export async function createGoogleEvent(
  account: GoogleAccountRecord,
  event: GoogleEventInput
): Promise<GoogleApiResult> {
  const { result, refreshed } = await withFreshToken(account, async (token) => {
    const body = toGoogleEventBody(event);
    const out = (await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(account.calendar_id)}/events?${SEND_UPDATES}`,
      { method: 'POST', body: JSON.stringify(body), accessToken: token }
    )) as { id: string };
    return out.id;
  });
  return { googleEventId: result, refreshed };
}

export async function updateGoogleEvent(
  account: GoogleAccountRecord,
  googleEventId: string,
  event: GoogleEventInput
): Promise<GoogleApiResult> {
  const { result, refreshed } = await withFreshToken(account, async (token) => {
    const body = toGoogleEventBody(event);
    const out = (await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(account.calendar_id)}/events/${encodeURIComponent(googleEventId)}?${SEND_UPDATES}`,
      { method: 'PATCH', body: JSON.stringify(body), accessToken: token }
    )) as { id: string };
    return out.id;
  });
  return { googleEventId: result, refreshed };
}

export async function deleteGoogleEvent(
  account: GoogleAccountRecord,
  googleEventId: string
): Promise<{ refreshed: { accessToken: string; expiresAt: Date } | null }> {
  const { refreshed } = await withFreshToken(account, async (token) => {
    await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(account.calendar_id)}/events/${encodeURIComponent(googleEventId)}?${SEND_UPDATES}`,
      { method: 'DELETE', accessToken: token }
    );
    return null;
  });
  return { refreshed };
}
