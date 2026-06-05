import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const bodySchema = z.object({
  decisionNote: z.string().max(2000).optional(),
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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Usa service client porque a function approve_meeting_request faz inserts em events
  // (que tem RLS admin-only pra INSERT). A function eh SECURITY DEFINER mas precisa do bypass.
  const serviceDb = await getSupabaseServiceClient();
  const repo = new MeetingRequestRepository(serviceDb);

  try {
    const eventId = await repo.approve({
      requestId: id,
      reviewerId: member.id,
      decisionNote: parsed.data.decisionNote,
    });
    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao aprovar';
    console.error('[api/meetings/approve] failed', { requestId: id, reviewerId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao aprovar a solicitação';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('not authorized')) {
      userMsg = 'Sem permissão para aprovar esta solicitação';
      status = 403;
    } else if (lower.includes('not found') || lower.includes('does not exist')) {
      userMsg = 'Solicitação não encontrada';
      status = 404;
    } else if (lower.includes('already')) {
      userMsg = 'Solicitação já foi decidida';
      status = 409;
    } else if (lower.includes('conflict')) {
      userMsg = 'Conflito de horário detectado';
      status = 409;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }
}
