import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  memberId: z.string().uuid().optional(),
});

// Endpoint admin: desconecta o Outlook Calendar de 1 sócio específico ou de TODOS.
// Microsoft Graph não tem revoke público — apenas removemos as linhas do banco.
export async function POST(req: NextRequest) {
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const targetMemberId = parsed.success ? parsed.data.memberId : undefined;

  const serviceDb = await getSupabaseServiceClient();

  // Pega TODOS providers (não só microsoft) — admin disconnect deve limpar o estado
  // completo, incluindo rows órfãs com provider='google' herdadas da migração 0014.
  const query = serviceDb
    .from('calendar_provider_accounts')
    .select('id, member_id');
  if (targetMemberId) query.eq('member_id', targetMemberId);

  const { data: rows } = await query;
  const accounts = (rows ?? []) as Array<{ id: string; member_id: string }>;

  // Acha members marcados como linked mesmo sem nenhuma row (estado inconsistente)
  // — precisamos zerar o calendar_linked deles também
  const memberIds = new Set(accounts.map((a) => a.member_id));
  if (targetMemberId) memberIds.add(targetMemberId);

  if (accounts.length === 0 && memberIds.size === 0) {
    return NextResponse.json({ ok: true, disconnected: 0 });
  }

  if (accounts.length > 0) {
    const accountIds = accounts.map((a) => a.id);
    await serviceDb.from('calendar_provider_accounts').delete().in('id', accountIds);
  }
  if (memberIds.size > 0) {
    await serviceDb.from('members').update({ calendar_linked: false }).in('id', [...memberIds]);
  }

  return NextResponse.json({ ok: true, disconnected: accounts.length });
}
