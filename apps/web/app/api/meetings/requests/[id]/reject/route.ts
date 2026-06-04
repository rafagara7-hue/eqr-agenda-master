import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const bodySchema = z.object({
  reason: z.string().min(1).max(2000),
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
  if (!parsed.success) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const repo = new MeetingRequestRepository(serviceDb);

  try {
    await repo.reject({ requestId: id, reviewerId: member.id, reason: parsed.data.reason });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao rejeitar';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
