import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/meetings/availability/[partnerId]?from=ISO&to=ISO
 *
 * Retorna busy slots do socio na janela. Usa view v_availability_busy_slots
 * que respeita RLS — funcionario so ve (member_id, start, end, 'busy').
 *
 * Overlap fix (PR #23 audit): usa predicado de OVERLAP em vez de start_at-only
 * pra incluir eventos que cruzam a borda do range (espelhando o fix do
 * public_get_partner_availability na migration 0022).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)) {
    return NextResponse.json({ error: 'invalid partner id' }, { status: 400 });
  }

  // OVERLAP predicate: event.start_at < to AND event.end_at > from
  // (PostgREST sintaxe — equivale a tstzrange overlap, captura eventos
  // que cruzam a borda do range. Antes usavamos só gte/lte em start_at,
  // o que perdia eventos overnight ou multi-dia.)
  const { data, error } = await supabase
    .from('v_availability_busy_slots')
    .select('member_id, start_at, end_at, status, title_if_public')
    .eq('member_id', partnerId)
    .lt('start_at', to)
    .gt('end_at', from)
    .order('start_at', { ascending: true });

  if (error) {
    console.error('[api/meetings/availability] query failed', { partnerId, error: error.message });
    return NextResponse.json({ error: 'Erro ao consultar disponibilidade' }, { status: 500 });
  }

  return NextResponse.json({ slots: data ?? [] });
}
