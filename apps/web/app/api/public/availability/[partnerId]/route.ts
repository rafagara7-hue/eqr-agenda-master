import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/public/availability/[partnerId]?from=ISO&to=ISO
 *
 * Endpoint PUBLICO usado pelo form /agendar para conflict check pre-submit.
 * Chama public_get_partner_availability SECURITY DEFINER que retorna apenas
 * (start_at, end_at) — sem titulos, sem IDs (privacidade).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  }
  // UUID guard basico
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)) {
    return NextResponse.json({ error: 'invalid partner id' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc('public_get_partner_availability', {
    p_partner_id: partnerId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('[api/public/availability] failed', { partnerId, error: error.message });
    const lower = error.message.toLowerCase();
    let status = 400;
    let userMsg = 'Erro ao verificar disponibilidade';
    if (lower.includes('not found')) {
      userMsg = 'Sócio não encontrado';
      status = 404;
    } else if (lower.includes('range too wide')) {
      userMsg = 'Período muito amplo';
      status = 422;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }

  return NextResponse.json({ slots: data ?? [] });
}
