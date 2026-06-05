import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id').eq('user_id', user.id).single();
  const member = rawMember as { id: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();
  try {
    const { error } = await serviceDb.rpc('mark_external_notified', { p_request_id: id });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro';
    console.error('[api/meetings/notify-external] failed', { requestId: id, error: raw });
    const lower = raw.toLowerCase();
    if (lower.includes('forbidden')) return NextResponse.json({ error: 'Sem permissão (admin)' }, { status: 403 });
    return NextResponse.json({ error: 'Erro ao marcar como notificado' }, { status: 400 });
  }
}
