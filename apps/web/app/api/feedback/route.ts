import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

const createSchema = z.object({
  type: z.enum(['error', 'suggestion']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
});

async function getMe(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  // PGRST116 (no rows) é estado válido pra users sem member; outros são bugs.
  if (error && error.code !== 'PGRST116') {
    console.error('[api/feedback/getMe] members lookup failed', { userId: user.id, code: error.code, message: error.message });
    return null;
  }
  return data as { id: string; role: string } | null;
}

export async function GET(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const me = await getMe(supabase);
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceDb = await getSupabaseServiceClient();
  const query = serviceDb
    .from('feedback')
    .select('id, member_id, type, title, description, status, admin_note, created_at, updated_at, members(name, color_hex, avatar_url)')
    .order('created_at', { ascending: false });

  if (me.role !== 'admin') query.eq('member_id', me.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const me = await getMe(supabase);
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const { data, error } = await serviceDb
    .from('feedback')
    .insert({
      member_id: me.id,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description,
    })
    .select('id, member_id, type, title, description, status, admin_note, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notifica admins
  const { data: admins } = await serviceDb
    .from('members')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true);
  const { data: actor, error: actorErr } = await serviceDb
    .from('members')
    .select('name')
    .eq('id', me.id)
    .single();
  if (actorErr && actorErr.code !== 'PGRST116') {
    console.warn('[api/feedback/POST] actor lookup failed', { memberId: me.id, code: actorErr.code });
  }
  const actorName = (actor as { name?: string } | null)?.name ?? 'Membro';
  const adminIds = ((admins ?? []) as { id: string }[]).map((a) => a.id).filter((id) => id !== me.id);
  if (adminIds.length > 0) {
    await serviceDb.from('notifications').insert(
      adminIds.map((aid) => ({
        member_id: aid,
        type: 'feedback_new',
        title: parsed.data.type === 'error' ? `${actorName} reportou um erro` : `${actorName} enviou uma sugestão`,
        body: parsed.data.title,
        event_id: null,
      }))
    );
  }

  return NextResponse.json({ feedback: data });
}
