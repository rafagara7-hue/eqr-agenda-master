import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

const updateSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'rejected']).optional(),
  admin_note: z.string().trim().max(4000).nullable().optional(),
});

async function getAdmin(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = data as { id: string; role: string } | null;
  return me?.role === 'admin' ? me : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const admin = await getAdmin(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.admin_note !== undefined) updates.admin_note = parsed.data.admin_note;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await serviceDb
    .from('feedback')
    .update(updates)
    .eq('id', id)
    .select('id, member_id, type, title, description, status, admin_note, created_at, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Notifica autor sobre mudança de status / resposta
  const row = data as { member_id: string; title: string; status: string };
  if (row.member_id !== admin.id) {
    await serviceDb.from('notifications').insert({
      member_id: row.member_id,
      type: 'feedback_update',
      title: 'Seu feedback foi atualizado',
      body: `${row.title} — ${row.status}`,
      event_id: null,
    });
  }

  return NextResponse.json({ feedback: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const admin = await getAdmin(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();
  const { error } = await serviceDb.from('feedback').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
