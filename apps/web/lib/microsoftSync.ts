/**
 * Sync de eventos do app → Microsoft Outlook Calendar do member dono (member_id).
 *
 * Chamado fire-and-forget pelas rotas /api/events. Erros não propagam: marcam
 * sync_status='failed' + sync_error no evento, mas nunca quebram a operação principal.
 *
 * Substitui o antigo lib/googleSync.ts. Usa a nova tabela calendar_provider_accounts
 * filtrada por provider='microsoft'.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  encryptToken,
  type MicrosoftAccountRecord,
  type MicrosoftEventInput,
} from './microsoft';

type ServiceDb = SupabaseClient<Database>;

async function getAccount(db: ServiceDb, memberId: string): Promise<MicrosoftAccountRecord | null> {
  // Filtra rows iCal-only (ical_url IS NOT NULL, tokens NULL) pra não devolver
  // conta sem OAuth pro fluxo de sync OAuth — quebraria com null deref.
  const { data } = await db
    .from('calendar_provider_accounts')
    .select('id, member_id, provider_email, calendar_id, access_token, refresh_token, token_expires_at, ical_url')
    .eq('member_id', memberId)
    .eq('provider', 'microsoft')
    .eq('sync_enabled', true)
    .is('ical_url', null)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as MicrosoftAccountRecord & { ical_url: string | null };
  // Sanity check: row OAuth deve ter todos os 3 tokens preenchidos (CHECK do DB garante)
  if (!row.access_token || !row.refresh_token || !row.token_expires_at) return null;
  return row;
}

/**
 * Para reunião conjunta, busca os e-mails Microsoft dos OUTROS participantes
 * (excluindo o owner). Só inclui members que conectaram o Outlook Calendar.
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
    .from('calendar_provider_accounts')
    .select('provider_email')
    .eq('provider', 'microsoft')
    .in('member_id', participantIds);
  return ((accs ?? []) as { provider_email: string }[])
    .map((a) => a.provider_email)
    .filter((e): e is string => !!e);
}

async function persistRefreshedToken(
  db: ServiceDb,
  accountId: string,
  refreshed: { accessToken: string; refreshToken: string; expiresAt: Date }
) {
  // Microsoft rotaciona refresh_token — precisamos atualizar ambos.
  await db
    .from('calendar_provider_accounts')
    .update({
      access_token: encryptToken(refreshed.accessToken),
      refresh_token: encryptToken(refreshed.refreshToken),
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

/**
 * Se o erro indicar refresh_token inválido/expirado, limpa a conta órfã.
 * Microsoft erros vêm como JSON com error_codes (ex: 70008 = AADSTS70008 = token expirado).
 */
async function dropAccountIfTokenDead(
  db: ServiceDb,
  account: MicrosoftAccountRecord,
  err: unknown
): Promise<void> {
  if (!(err instanceof Error)) return;
  const msg = err.message;
  const dead =
    msg.includes('invalid_grant') ||
    msg.includes('AADSTS70008') ||  // refresh token expired
    msg.includes('AADSTS50173') ||  // user changed password
    msg.includes('AADSTS700082');   // refresh token has expired due to inactivity
  if (!dead) return;
  await db.from('calendar_provider_accounts').delete().eq('id', account.id);
  await db.from('members').update({ calendar_linked: false }).eq('id', account.member_id);
}

async function markSynced(db: ServiceDb, eventId: string, externalEventId: string) {
  await db
    .from('events')
    .update({
      sync_status: 'synced',
      sync_error: null,
      external_event_id: externalEventId,
      external_provider: 'microsoft',
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

/**
 * Resumo do que o sync tentou — usado pelo caller (route.ts) pra computar o
 * sync_status final combinando com CalDAV.
 * - attempted=false: member sem Outlook → no-op (não conta como sucesso nem falha)
 * - attempted=true, succeeded=true: createCalendarEvent rodou OK (markSynced rodou)
 * - attempted=true, succeeded=false: erro no caminho do MS (markFailed rodou)
 */
export interface MicrosoftSyncResult {
  attempted: boolean;
  succeeded: boolean;
}

export async function syncCreateToMicrosoft(
  db: ServiceDb,
  opts: { eventId: string; memberId: string; data: MicrosoftEventInput }
): Promise<MicrosoftSyncResult> {
  let account: MicrosoftAccountRecord | null = null;
  try {
    account = await getAccount(db, opts.memberId);
    if (!account) return { attempted: false, succeeded: false }; // Member sem Outlook conectado — no-op
    const attendees = await getAttendeeEmails(db, opts.eventId, opts.memberId);
    const payload: MicrosoftEventInput = { ...opts.data, attendees };
    const { externalEventId, refreshed } = await createCalendarEvent(account, payload);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
    await markSynced(db, opts.eventId, externalEventId);
    return { attempted: true, succeeded: true };
  } catch (err) {
    if (account) await dropAccountIfTokenDead(db, account, err);
    await markFailed(db, opts.eventId, err);
    return { attempted: true, succeeded: false };
  }
}

export async function syncUpdateToMicrosoft(
  db: ServiceDb,
  opts: { eventId: string; memberId: string; externalEventId: string | null; data: MicrosoftEventInput }
): Promise<MicrosoftSyncResult> {
  let account: MicrosoftAccountRecord | null = null;
  try {
    account = await getAccount(db, opts.memberId);
    if (!account) return { attempted: false, succeeded: false };

    const attendees = await getAttendeeEmails(db, opts.eventId, opts.memberId);
    const payload: MicrosoftEventInput = { ...opts.data, attendees };

    if (!opts.externalEventId) {
      const { externalEventId, refreshed } = await createCalendarEvent(account, payload);
      if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
      await markSynced(db, opts.eventId, externalEventId);
      return { attempted: true, succeeded: true };
    }

    const { refreshed } = await updateCalendarEvent(account, opts.externalEventId, payload);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
    await markSynced(db, opts.eventId, opts.externalEventId);
    return { attempted: true, succeeded: true };
  } catch (err) {
    if (account) await dropAccountIfTokenDead(db, account, err);
    await markFailed(db, opts.eventId, err);
    return { attempted: true, succeeded: false };
  }
}

export async function syncDeleteFromMicrosoft(
  db: ServiceDb,
  opts: { memberId: string; externalEventId: string | null }
): Promise<void> {
  if (!opts.externalEventId) return;
  try {
    const account = await getAccount(db, opts.memberId);
    if (!account) return;
    const { refreshed } = await deleteCalendarEvent(account, opts.externalEventId);
    if (refreshed) await persistRefreshedToken(db, account.id, refreshed);
  } catch {
    // Sync de DELETE falhando não trava — o evento já foi removido do app.
  }
}
