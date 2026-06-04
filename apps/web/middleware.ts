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

  // ATENÇÃO: não chamar getSession() — usar getUser() para validação server-side
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redireciona usuários não autenticados para login
  const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth');
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Usuário logado tentando acessar /login → redireciona ao dashboard apropriado
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    const role = await getMemberRole(supabase, user.id);
    url.pathname =
      role === 'admin'    ? '/admin'
      : role === 'employee' ? '/staff'
      : '/calendar';
    return NextResponse.redirect(url);
  }

  // /staff/* — exclusivo de funcionários. Sócio/admin redirecionam pra /calendar/admin.
  if (user && pathname.startsWith('/staff')) {
    const role = await getMemberRole(supabase, user.id);
    if (role !== 'employee') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'admin' ? '/admin' : '/calendar';
      return NextResponse.redirect(url);
    }
  }

  // Funcionário NÃO acessa interface principal de sócio.
  // Bloqueia /calendar, /partner/*, /meetings/*, /admin/* (admin já gateado abaixo).
  if (user && (
    pathname.startsWith('/calendar')
    || pathname.startsWith('/partner')
    || pathname.startsWith('/meetings')
    || pathname.startsWith('/geral')
    || pathname.startsWith('/feedback')
  )) {
    const role = await getMemberRole(supabase, user.id);
    if (role === 'employee') {
      const url = request.nextUrl.clone();
      url.pathname = '/staff';
      return NextResponse.redirect(url);
    }
  }

  // Protege rotas /admin/* para não-admins. Exceções:
  // - /admin/settings: acessível a todos
  // - /admin/members/[id]: acessível a todos; a página valida se o member pode ver aquele id específico
  //   (admin vê todos; member só vê o próprio perfil — redireciona dentro da page.tsx)
  if (user && pathname.startsWith('/admin')) {
    const isAllowedForMember = pathname === '/admin/settings' || /^\/admin\/members\/[^/]+$/.test(pathname);
    if (!isAllowedForMember) {
      const role = await getMemberRole(supabase, user.id);
      if (role !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = role === 'employee' ? '/staff' : '/calendar';
        return NextResponse.redirect(url);
      }
    }
  }

  // Injeta member_id no header para uso nas API routes
  if (user) {
    supabaseResponse.headers.set('x-user-id', user.id);
  }

  return supabaseResponse;
}

async function getMemberRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('members')
    .select('role')
    .eq('user_id', userId)
    .single();
  const m = data as { role: string } | null;
  return m?.role ?? 'member';
}

export const config = {
  matcher: [
    // Exclui assets, rotas publicas e endpoints autenticados por outros mecanismos:
    // - api/health: healthcheck publico
    // - api/cron/*: Vercel Cron valida via CRON_SECRET Bearer no proprio handler
    // - api/webhooks/*: validados via HMAC signature no handler
    '/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/webhooks).*)',
  ],
};
