import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repo = new MeetingRequestRepository(supabase);
  const request = await repo.findById(id);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [history, comments] = await Promise.all([
    repo.getHistory(id),
    repo.getComments(id),
  ]);

  return NextResponse.json({ request, history, comments });
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
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro' }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
