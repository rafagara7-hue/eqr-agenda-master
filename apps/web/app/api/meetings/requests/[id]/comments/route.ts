import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const bodySchema = z.object({
  body: z.string().min(1).max(2000),
  visibleToRequester: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id, role').eq('user_id', user.id).single();
  const member = rawMember as { id: string; role: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Comentário inválido (vazio ou muito longo)' }, { status: 400 });
  }

  // Apenas admin/sócio podem marcar comentário como interno (visibleToRequester=false).
  // Funcionário (requester) nunca pode esconder comentário do próprio fluxo.
  const canMarkInternal = member.role === 'admin' || member.role === 'member';
  const visibleToRequester = canMarkInternal
    ? (parsed.data.visibleToRequester ?? true)
    : true;

  const repo = new MeetingRequestRepository(supabase);
  try {
    const comment = await repo.addComment({
      meetingRequestId: id,
      authorId: member.id,
      body: parsed.data.body.trim(),
      visibleToRequester,
    });
    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao comentar';
    console.error('[api/meetings/comments] failed', { requestId: id, memberId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao adicionar comentário';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('row-level')) {
      userMsg = 'Sem permissão para comentar nesta solicitação';
      status = 403;
    } else if (lower.includes('not found') || lower.includes('does not exist')) {
      userMsg = 'Solicitação não encontrada';
      status = 404;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }
}
