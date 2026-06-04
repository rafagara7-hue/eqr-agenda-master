import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/meetings/availability/[partnerId]?from=ISO&to=ISO
 *
 * Retorna busy slots do socio na janela. Usa view v_availability_busy_slots
 * que respeita RLS — funcionario so ve (member_id, start, end, 'busy').
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

  // View v_availability_busy_slots eh security_invoker e respeita RLS de events.
  // Funcionarios sem acesso direto a events nao veem detalhes — so member_id, start, end.
  const { data, error } = await supabase
    .from('v_availability_busy_slots')
    .select('member_id, start_at, end_at, status, title_if_public')
    .eq('member_id', partnerId)
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ slots: data ?? [] });
}
