import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Apaga em lote todos os eventos cujo end_at < now.
 * Apenas admin. Não propaga a remoção para o Outlook Calendar (eventos passados
 * são irrelevantes lá; manter performance).
 */
export async function POST(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMember as { id: string; role: string } | null;
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();
  const cutoff = new Date().toISOString();

  // Conta antes pra retornar o número apagado
  const { data: rows, error: selErr } = await serviceDb
    .from('events')
    .select('id')
    .lt('end_at', cutoff);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  const { error: delErr } = await serviceDb.from('events').delete().in('id', ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: ids.length });
}
