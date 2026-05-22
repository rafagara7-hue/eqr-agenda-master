import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, encryptToken } from '@/lib/google';

// Callback do OAuth Google. Recebe ?code & ?state, valida state via cookie,
// troca code por tokens, criptografa e persiste em google_calendar_accounts.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const cookieState = req.cookies.get('eqr-google-state')?.value;
  const cookieMember = req.cookies.get('eqr-google-member')?.value;

  function back(qs: string) {
    return NextResponse.redirect(new URL(`/admin/settings?${qs}`, req.url));
  }

  if (errorParam) return back(`google=denied&reason=${encodeURIComponent(errorParam)}`);
  if (!code || !state) return back('google=invalid');
  if (!cookieState || cookieState !== state) return back('google=state-mismatch');
  if (!cookieMember) return back('google=no-member');

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: rawMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string } | null;
  if (!member || member.id !== cookieMember) return back('google=member-mismatch');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token-exchange-failed';
    return back(`google=error&reason=${encodeURIComponent(msg)}`);
  }

  const serviceDb = await getSupabaseServiceClient();
  const { error: upsertErr } = await serviceDb.from('google_calendar_accounts').upsert(
    {
      member_id: member.id,
      google_email: tokens.email,
      calendar_id: 'primary',
      access_token: encryptToken(tokens.accessToken),
      refresh_token: encryptToken(tokens.refreshToken),
      token_expires_at: tokens.expiresAt.toISOString(),
      sync_enabled: true,
      is_primary: true,
    },
    { onConflict: 'member_id,google_email' }
  );
  if (upsertErr) return back(`google=db-error&reason=${encodeURIComponent(upsertErr.message)}`);

  await serviceDb.from('members').update({ google_linked: true }).eq('id', member.id);

  const res = back('google=connected');
  res.cookies.delete('eqr-google-state');
  res.cookies.delete('eqr-google-member');
  return res;
}
