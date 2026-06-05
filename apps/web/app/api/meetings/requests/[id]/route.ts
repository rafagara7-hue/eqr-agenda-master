import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repo = new MeetingRequestRepository(supabase);
  try {
    const request = await repo.findById(id);
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [historyRes, commentsRes] = await Promise.allSettled([
      repo.getHistory(id),
      repo.getComments(id),
    ]);
    // Partial-degrade: se historico ou comments falha, retorna [] mas mantem request
    const history = historyRes.status === 'fulfilled' ? historyRes.value : [];
    const comments = commentsRes.status === 'fulfilled' ? commentsRes.value : [];
    if (historyRes.status === 'rejected') console.error('[api/meetings/detail] history failed', { id, error: historyRes.reason });
    if (commentsRes.status === 'rejected') console.error('[api/meetings/detail] comments failed', { id, error: commentsRes.reason });

    return NextResponse.json({ request, history, comments });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro';
    console.error('[api/meetings/detail] failed', { id, error: raw });
    return NextResponse.json({ error: 'Erro ao carregar solicitação' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id').eq('user_id', user.id).single();
  const member = rawMember as { id: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const repo = new MeetingRequestRepository(supabase);

  // Apenas cancelar suportado via PATCH (RLS bloqueia outras transições do requester)
  if (body.action === 'cancel') {
    try {
      await repo.cancel(id, member.id);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erro ao cancelar';
      console.error('[api/meetings/cancel] failed', { requestId: id, memberId: member.id, error: raw });
      const lower = raw.toLowerCase();
      let userMsg = 'Erro ao cancelar a solicitação';
      let status = 400;
      if (lower.includes('forbidden') || lower.includes('row-level') || lower.includes('not authorized')) {
        userMsg = 'Sem permissão para cancelar esta solicitação';
        status = 403;
      } else if (lower.includes('not found') || lower.includes('does not exist')) {
        userMsg = 'Solicitação não encontrada';
        status = 404;
      } else if (lower.includes('already')) {
        userMsg = 'Solicitação já foi decidida';
        status = 409;
      }
      return NextResponse.json({ error: userMsg }, { status });
    }
  }

  return NextResponse.json({ error: 'Ação não suportada' }, { status: 400 });
}
