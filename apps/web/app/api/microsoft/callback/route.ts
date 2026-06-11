import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import {
  exchangeCodeForTokens,
  encryptToken,
  createCalendarSubscription,
  type MicrosoftAccountRecord,
} from '@/lib/microsoft';

// Constant-time string compare pra mitigar timing attack na validação do
// CSRF state cookie do OAuth.
function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// Callback do OAuth Microsoft Entra ID. Recebe ?code & ?state, valida state via cookie,
// troca code por tokens, criptografa e persiste em calendar_provider_accounts (provider='microsoft').
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const cookieState = req.cookies.get('eqr-ms-state')?.value;
  const cookieMember = req.cookies.get('eqr-ms-member')?.value;

  function back(qs: string) {
    return NextResponse.redirect(new URL(`/admin/settings?${qs}`, req.url));
  }

  if (errorParam) return back(`microsoft=denied&reason=${encodeURIComponent(errorParam)}`);
  if (!code || !state) return back('microsoft=invalid');
  if (!cookieState || !timingSafeStrEqual(cookieState, state)) return back('microsoft=state-mismatch');
  if (!cookieMember) return back('microsoft=no-member');

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: rawMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string } | null;
  if (!member || member.id !== cookieMember) return back('microsoft=member-mismatch');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token-exchange-failed';
    return back(`microsoft=error&reason=${encodeURIComponent(msg)}`);
  }

  const serviceDb = await getSupabaseServiceClient();

  // Gera clientState secreto pra validar notifications do webhook
  // (defesa contra notifications forjadas)
  const clientState = crypto.randomBytes(24).toString('hex');

  const { data: rawUpsert, error: upsertErr } = await serviceDb
    .from('calendar_provider_accounts')
    .upsert(
      {
        member_id: member.id,
        provider: 'microsoft',
        provider_email: tokens.email,
        calendar_id: 'primary',
        access_token: encryptToken(tokens.accessToken),
        refresh_token: encryptToken(tokens.refreshToken),
        token_expires_at: tokens.expiresAt.toISOString(),
        sync_enabled: true,
        is_primary: true,
        metadata: { microsoftClientState: clientState },
      },
      { onConflict: 'member_id,provider,provider_email' }
    )
    .select('id')
    .single();

  if (upsertErr || !rawUpsert) return back(`microsoft=db-error&reason=${encodeURIComponent(upsertErr?.message ?? 'no-row')}`);

  const account: MicrosoftAccountRecord = {
    id: (rawUpsert as { id: string }).id,
    member_id: member.id,
    provider_email: tokens.email,
    calendar_id: 'primary',
    access_token: encryptToken(tokens.accessToken),
    refresh_token: encryptToken(tokens.refreshToken),
    token_expires_at: tokens.expiresAt.toISOString(),
  };

  // Cria subscription Graph (webhook) — fire-and-forget mas com log de erro.
  // Real-time não bloqueia o "Conectar". Se falhar, o cron renova/recria no próximo ciclo.
  try {
    const host = process.env['NEXT_PUBLIC_APP_HOST']
      ? `https://${process.env['NEXT_PUBLIC_APP_HOST']}`
      : new URL(req.url).origin;
    const notificationUrl = `${host}/api/webhooks/microsoft/calendar`;

    const { subscription, refreshed } = await createCalendarSubscription(account, {
      notificationUrl,
      clientState,
    });

    const update: Record<string, string | null> = {
      subscription_id: subscription.id,
      subscription_expiry: subscription.expirationDateTime,
    };
    if (refreshed) {
      update['access_token'] = encryptToken(refreshed.accessToken);
      update['refresh_token'] = encryptToken(refreshed.refreshToken);
      update['token_expires_at'] = refreshed.expiresAt.toISOString();
    }
    await serviceDb.from('calendar_provider_accounts').update(update).eq('id', account.id);
  } catch (err) {
    // Subscription falhou mas conexão OK — sem real-time, mas dá pra usar sync polling.
    console.error('[microsoft/callback] subscription create failed (non-fatal)', {
      memberId: member.id,
      error: err instanceof Error ? err.message : err,
    });
  }

  await serviceDb.from('members').update({ calendar_linked: true }).eq('id', member.id);

  const res = back('microsoft=connected');
  res.cookies.delete('eqr-ms-state');
  res.cookies.delete('eqr-ms-member');
  return res;
}
