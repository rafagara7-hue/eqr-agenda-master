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

  // Usuário logado tentando acessar /login → redireciona ao dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    // Determina destino baseado no role
    const role = await getMemberRole(supabase, user.id);
    url.pathname = role === 'admin' ? '/admin' : '/calendar';
    return NextResponse.redirect(url);
  }

  // Protege rotas /admin/* para não-admins (configurações é acessível a todos)
  if (user && pathname.startsWith('/admin') && pathname !== '/admin/settings') {
    const role = await getMemberRole(supabase, user.id);
    if (role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/calendar';
      return NextResponse.redirect(url);
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
  return data?.role ?? 'member';
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
};
