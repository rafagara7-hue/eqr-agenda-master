import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthorizationUrl } from '@/lib/microsoft';

// Inicia o fluxo OAuth Microsoft Entra ID: gera um state aleatório (CSRF), guarda em cookie,
// redireciona pra login.microsoftonline.com.
export async function GET(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', _req.url));

  const { data: rawMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const state = crypto.randomBytes(24).toString('hex');
  const url = getAuthorizationUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set('eqr-ms-state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  res.cookies.set('eqr-ms-member', member.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
