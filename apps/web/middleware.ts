import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // Rotas públicas — boundary checks (evita bypass via /agendarXxx ou /loginYyy).
  // /api/public/* eh excluido do matcher, mas mantemos no isPublicPath
  // pra defesa-em-profundidade caso o matcher mude.
  const isPublicPath =
    pathname === '/login'
    || pathname.startsWith('/login/')
    || pathname.startsWith('/auth/')
    || pathname === '/agendar'
    || pathname.startsWith('/agendar/')
    || pathname === '/privacidade'
    || pathname.startsWith('/privacidade/')
    || pathname.startsWith('/convite/')
    || pathname.startsWith('/api/public/');

  // Nao precisamos getUser() pra rotas publicas — evita chamada ao GoTrue
  if (isPublicPath) {
    return supabaseResponse;
  }

  // ATENÇÃO: getUser() valida server-side; nao usar getSession()
  const { data: { user } } = await supabase.auth.getUser();

  // Redireciona usuários não autenticados:
  //   - Páginas → redirect 307 pra /login (UX padrão de navegação)
  //   - API routes (/api/*) → JSON 401 (caller é fetch, não browser; redirect quebra)
  // O matcher já exclui /api/public, /api/health, /api/cron, /api/webhooks.
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Usuário logado tentando acessar /login → redireciona ao dashboard
  if (pathname === '/login') {
    const url = request.nextUrl.clone();
    const role = await getMemberRole(supabase, user.id);
    url.pathname = role === 'admin' ? '/admin' : '/calendar';
    return NextResponse.redirect(url);
  }

  // Protege rotas /admin/* para não-admins. Exceções:
  if (pathname.startsWith('/admin')) {
    const isAllowedForMember = pathname === '/admin/settings' || /^\/admin\/members\/[^/]+$/.test(pathname);
    if (!isAllowedForMember) {
      const role = await getMemberRole(supabase, user.id);
      if (role !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = '/calendar';
        return NextResponse.redirect(url);
      }
    }
  }

  // Injeta member_id no header SO em rotas autenticadas (nao em /agendar etc)
  supabaseResponse.headers.set('x-user-id', user.id);
  return supabaseResponse;
}

async function getMemberRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('members')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  // PGRST116 (no rows) é normal pra users sem member row; outros erros viram log.
  if (error && error.code !== 'PGRST116') {
    console.error('[middleware.getMemberRole]', { userId, code: error.code, message: error.message });
  }
  const m = data as { role: string } | null;
  return m?.role ?? 'member';
}

export const config = {
  matcher: [
    // Exclui assets, rotas publicas auto-contidas, e endpoints autenticados por outros mecanismos:
    // - api/health: healthcheck publico
    // - api/cron/*: Vercel Cron valida via CRON_SECRET Bearer
    // - api/webhooks/*: validados via HMAC signature
    // - api/public/*: auto-contidos via SECURITY DEFINER + zod + rate-limit
    '/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/webhooks|api/public).*)',
  ],
};
