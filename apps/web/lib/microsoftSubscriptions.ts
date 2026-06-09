/**
 * Renovação periódica de Microsoft Graph subscriptions.
 *
 * Microsoft TTL máximo pra subscription de calendar = 4230min (~3 dias).
 * Rodamos esse renew DENTRO do cron sync-ical (a cada 6h), checando quais
 * subscriptions estão a <24h de expirar e renovando elas.
 *
 * Se renew falhar (refresh_token morto, subscription deletada do lado Microsoft,
 * etc.), marcamos a row pra recriação no próximo connect do member.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import {
  renewCalendarSubscription,
  SUBSCRIPTION_RENEW_THRESHOLD_MS,
  type MicrosoftAccountRecord,
} from './microsoft';

type ServiceDb = SupabaseClient<Database>;

interface CpaRow {
  id: string;
  member_id: string;
  provider_email: string;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  subscription_id: string | null;
  subscription_expiry: string | null;
}

/**
 * Renova todas Microsoft subscriptions que estão a <24h de expirar.
 * Idempotente — pode rodar a cada 6h ou diariamente sem efeito colateral.
 */
export async function renewExpiringMicrosoftSubscriptions(
  db: ServiceDb
): Promise<{ ok: true; renewed: number; errors: number; skipped: number }> {
  const thresholdISO = new Date(Date.now() + SUBSCRIPTION_RENEW_THRESHOLD_MS).toISOString();

  const { data: rows } = await db
    .from('calendar_provider_accounts')
    .select(
      'id, member_id, provider_email, calendar_id, access_token, refresh_token, token_expires_at, subscription_id, subscription_expiry'
    )
    .eq('provider', 'microsoft')
    .not('subscription_id', 'is', null)
    .not('access_token', 'is', null) // só rows OAuth, não iCal-only
    .lte('subscription_expiry', thresholdISO);

  const accounts = (rows ?? []) as CpaRow[];

  let renewed = 0;
  let errors = 0;
  let skipped = 0;

  for (const acc of accounts) {
    if (!acc.subscription_id) {
      skipped++;
      continue;
    }

    const account: MicrosoftAccountRecord = {
      id: acc.id,
      member_id: acc.member_id,
      provider_email: acc.provider_email,
      calendar_id: acc.calendar_id,
      access_token: acc.access_token,
      refresh_token: acc.refresh_token,
      token_expires_at: acc.token_expires_at,
    };

    try {
      const { subscription, refreshed } = await renewCalendarSubscription(
        account,
        acc.subscription_id
      );

      const update: Record<string, string | null> = {
        subscription_expiry: subscription.expirationDateTime,
      };
      if (refreshed) {
        // Microsoft rotaciona refresh_token — precisa persistir
        const { encryptToken } = await import('./microsoft');
        update['access_token'] = encryptToken(refreshed.accessToken);
        update['refresh_token'] = encryptToken(refreshed.refreshToken);
        update['token_expires_at'] = refreshed.expiresAt.toISOString();
      }
      await db.from('calendar_provider_accounts').update(update).eq('id', acc.id);
      renewed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[microsoftSubscriptions] renew failed', {
        accountId: acc.id,
        memberId: acc.member_id,
        error: msg,
      });

      // Se subscription não existe mais do lado Microsoft (404) ou refresh_token
      // morto (AADSTS70008), limpa o subscription_id pra forçar recreate no próximo
      // /connect do member.
      const lower = msg.toLowerCase();
      const subscriptionGone =
        lower.includes('404') ||
        lower.includes('subscriptionnotfound') ||
        lower.includes('extensionerror');
      if (subscriptionGone) {
        await db
          .from('calendar_provider_accounts')
          .update({ subscription_id: null, subscription_expiry: null })
          .eq('id', acc.id);
      }
      errors++;
    }
  }

  return { ok: true, renewed, errors, skipped };
}
