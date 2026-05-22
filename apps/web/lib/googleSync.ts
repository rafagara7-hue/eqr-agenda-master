/**
 * Sync de eventos do app → Google Calendar do member dono (member_id) do evento.
 *
 * Chamado fire-and-forget pelas rotas /api/events. Erros não propagam: marcam
 * sync_status='failed' + sync_error no evento, mas nunca quebram a operação principal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  encryptToken,
  type GoogleAccountRecord,
  type GoogleEventInput,
} from './google';

type ServiceDb = SupabaseClient<Database>;

async function getAccount(db: ServiceDb, memberId: string): Promise<GoogleAccountRecord | null> {
  const { data } = await db
    .from('google_calendar_accounts')
    .select('*')
    .eq('member_id', memberId)
    .eq('sync_enabled', true)
    .maybeSingle();
  return (data as unknown as GoogleAccountRecord | null) ?? null;
}

/**
 * Para uma reunião conjunta, busca os e-mails Google dos OUTROS participantes
 * (excluindo o owner/host, que é o dono da conta sincronizada).
 * Só inclui members que conectaram o Google Calendar (têm google_email registrado).
 */
async function getAttendeeEmails(
  db: ServiceDb,
  eventId: string,
  ownerMemberId: string
): Promise<string[]> {
  const { data: pRows } = await db
    .from('event_participants')
    .select('member_id')
    .eq('event_id', eventId);
  const participantIds = ((pRows ?? []) as { member_id: string }[])
    .map((r) => r.member_id)
    .filter((id) => id !== ownerMemberId);
  if (participantIds.length === 0) return [];

  const { data: accs } = await db
    .from('google_calendar_accounts')
    .select('google_email')
    .in('member_id', participantIds);
  return ((accs ?? []) as { google_email: string }[])
    .map((a) => a.google_email)
    .filter((e): e is string => !!e);
}

async function persistRefreshedToken(
  db: ServiceDb,
  accountId: string,
  refreshed: { accessToken: string; expiresAt: Date }
) {
  await db
    .from('google_calendar_accounts')
    .update({
      access_token: encryptToken(refreshed.accessToken),
      token_expires_at: refreshed.expiresAt.toISOString(),
    })
    .eq('id', accountId);
}

async function markFailed(db: ServiceDb, eventId: string, err: unknown) {
  const message = err instanceof Error ? err.message : 'Erro desconhecido';
  await db
    .from('events')
    .update({
      sync_status: 'failed',
      sync_error: message.slice(0, 500),
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

async function markSynced(db: ServiceDb, eventId: string, googleEventId: string) {
  await db
    .from('events')
    .update({
      sync_status: 'synced',
      sync_error: null,
      google_event_id: googleEventId,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

export async function syncCreateToGoogle(
  db: ServiceDb,
  opts: { eventId: string; memberId: string; data: GoogleEventInput }
): Promise<void> {
  try {
    const account = await getAccount(db, opts.memberId);
    if (!account) return; // Member sem Google conectado — no-op
    const attendees = await getAttendeeEmails(db, opts.eventId, opts.memberId);
    const payload: GoogleEventInput = { ...opts.data, attendees };
    const { googleEventId, refreshed } = await createGoogleEvent(account, payload);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
    await markSynced(db, opts.eventId, googleEventId);
  } catch (err) {
    await markFailed(db, opts.eventId, err);
  }
}

export async function syncUpdateToGoogle(
  db: ServiceDb,
  opts: { eventId: string; memberId: string; googleEventId: string | null; data: GoogleEventInput }
): Promise<void> {
  try {
    const account = await getAccount(db, opts.memberId);
    if (!account) return;

    const attendees = await getAttendeeEmails(db, opts.eventId, opts.memberId);
    const payload: GoogleEventInput = { ...opts.data, attendees };

    // Sem google_event_id ainda: trata como criar
    if (!opts.googleEventId) {
      const { googleEventId, refreshed } = await createGoogleEvent(account, payload);
      if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
      await markSynced(db, opts.eventId, googleEventId);
      return;
    }

    const { refreshed } = await updateGoogleEvent(account, opts.googleEventId, payload);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
    await markSynced(db, opts.eventId, opts.googleEventId);
  } catch (err) {
    await markFailed(db, opts.eventId, err);
  }
}

export async function syncDeleteFromGoogle(
  db: ServiceDb,
  opts: { memberId: string; googleEventId: string | null }
): Promise<void> {
  if (!opts.googleEventId) return;
  try {
    const account = await getAccount(db, opts.memberId);
    if (!account) return;
    const { refreshed } = await deleteGoogleEvent(account, opts.googleEventId);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
  } catch {
    // Sync de DELETE falhando não trava — o evento já foi removido do app.
  }
}
