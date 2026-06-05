import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, encryptToken } from '@/lib/microsoft';

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
  if (!cookieState || cookieState !== state) return back('microsoft=state-mismatch');
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
  const { error: upsertErr } = await serviceDb.from('calendar_provider_accounts').upsert(
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
    },
    { onConflict: 'member_id,provider,provider_email' }
  );
  if (upsertErr) return back(`microsoft=db-error&reason=${encodeURIComponent(upsertErr.message)}`);

  await serviceDb.from('members').update({ calendar_linked: true }).eq('id', member.id);

  const res = back('microsoft=connected');
  res.cookies.delete('eqr-ms-state');
  res.cookies.delete('eqr-ms-member');
  return res;
}
