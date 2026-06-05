import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const bodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id').eq('user_id', user.id).single();
  const member = rawMember as { id: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const repo = new MeetingRequestRepository(serviceDb);

  try {
    await repo.reject({ requestId: id, reviewerId: member.id, reason: parsed.data.reason ?? '' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao rejeitar';
    console.error('[api/meetings/reject] failed', { requestId: id, reviewerId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao rejeitar a solicitação';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('not authorized')) {
      userMsg = 'Sem permissão para rejeitar esta solicitação';
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
