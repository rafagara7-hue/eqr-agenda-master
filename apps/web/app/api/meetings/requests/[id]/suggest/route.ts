import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

const bodySchema = z.object({
  newStart: z.string().datetime(),
  newEnd: z.string().datetime(),
  message: z.string().max(2000).optional(),
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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const repo = new MeetingRequestRepository(serviceDb);

  try {
    await repo.suggestReschedule({
      requestId: id,
      partnerId: member.id,
      newStart: new Date(parsed.data.newStart),
      newEnd: new Date(parsed.data.newEnd),
      message: parsed.data.message,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro' }, { status: 400 });
  }
}
