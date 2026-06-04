import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const createSchema = z.object({
  targetPartnerId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  observations: z.string().max(2000).optional(),
  proposedStart: z.string().datetime(),
  proposedEnd: z.string().datetime(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  participantIds: z.array(z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id, role').eq('user_id', user.id).single();
  const member = rawMember as { id: string; role: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const repo = new MeetingRequestRepository(supabase);

  try {
    const created = await repo.create({
      requesterId: member.id,
      targetPartnerId: parsed.data.targetPartnerId,
      title: parsed.data.title,
      description: parsed.data.description,
      observations: parsed.data.observations,
      proposedStart: new Date(parsed.data.proposedStart),
      proposedEnd: new Date(parsed.data.proposedEnd),
      priority: parsed.data.priority,
      participantIds: parsed.data.participantIds,
    });
    return NextResponse.json({ ok: true, request: created });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao criar solicitacao';
    console.error('[api/meetings/create] failed', { memberId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao criar solicitação';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('not authorized') || lower.includes('row-level')) {
      userMsg = 'Sem permissão para criar esta solicitação';
      status = 403;
    } else if (lower.includes('not found') || lower.includes('does not exist')) {
      userMsg = 'Destinatário ou solicitante inválido';
      status = 404;
    } else if (lower.includes('invalid time range')) {
      userMsg = 'Horário inválido: o fim precisa ser depois do início';
      status = 422;
    } else if (lower.includes('invalid duration')) {
      userMsg = 'Duração inválida: máximo 8 horas';
      status = 422;
    } else if (lower.includes('cannot request meeting with yourself')) {
      userMsg = 'Não é possível pedir uma reunião com você mesmo';
      status = 422;
    } else if (lower.includes('target must be partner')) {
      userMsg = 'Destinatário precisa ser sócio ou admin';
      status = 422;
    } else if (lower.includes('invalid priority')) {
      userMsg = 'Prioridade inválida';
      status = 422;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const partnerParam = url.searchParams.get('target_partner_id');
  const requesterParam = url.searchParams.get('requester_id');
  const priorityParam = url.searchParams.get('priority');

  const repo = new MeetingRequestRepository(supabase);
  const rows = await repo.findAll({
    status: statusParam ? statusParam.split(',') as Array<'pending'|'in_review'|'approved'|'rejected'|'cancelled'|'completed'|'expired'> : undefined,
    targetPartnerId: partnerParam ?? undefined,
    requesterId: requesterParam ?? undefined,
    priority: priorityParam ?? undefined,
  });
  return NextResponse.json({ requests: rows });
}
