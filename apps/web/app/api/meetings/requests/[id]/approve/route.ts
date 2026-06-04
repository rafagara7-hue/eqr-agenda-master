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
    const msg = err instanceof Error ? err.message : 'Erro ao aprovar';
    const status = msg.includes('forbidden') ? 403 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
