// apps/web/app/api/meetings/requests/[id]/cancel-as-partner/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

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

  try {
    const { error } = await serviceDb.rpc('cancel_meeting_request_as_partner', {
      p_request_id: id,
      p_partner_id: member.id,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao cancelar';
    console.error('[api/meetings/cancel-as-partner] failed', { requestId: id, partnerId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao cancelar a reunião';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('not authorized')) {
      userMsg = 'Sem permissão para cancelar esta reunião';
      status = 403;
    } else if (lower.includes('not found') || lower.includes('does not exist')) {
      userMsg = 'Reunião não encontrada';
      status = 404;
    } else if (lower.includes('cannot cancel')) {
      userMsg = 'Esta reunião não pode ser cancelada';
      status = 409;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }
}