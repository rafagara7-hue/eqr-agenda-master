import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { validatePhone } from '@/lib/phone';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: rawCurrentMember, error: meErr } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  if (meErr && meErr.code !== 'PGRST116') {
    console.error('[api/members/[id]/PUT] me lookup failed', { userId: user.id, code: meErr.code });
    return NextResponse.json({ error: 'Erro ao validar permissão' }, { status: 500 });
  }
  const currentMember = rawCurrentMember as { id: string; role: string } | null;

  if (!currentMember) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });

  if (currentMember.role !== 'admin' && currentMember.id !== params.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await request.json() as {
    name?: string;
    avatar_url?: string | null;
    color_hex?: string;
    phone?: string | null;
  };

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name?.trim()) updateData['name'] = body.name.trim();
  if ('avatar_url' in body) updateData['avatar_url'] = body.avatar_url ?? null;
  if (body.color_hex && /^#[0-9A-Fa-f]{6}$/.test(body.color_hex)) {
    updateData['color_hex'] = body.color_hex;
  }
  if ('phone' in body) {
    const check = validatePhone(body.phone);
    if (!check.ok) {
      return NextResponse.json({ error: check.error ?? 'Telefone inválido' }, { status: 400 });
    }
    updateData['phone'] = check.value;
  }

  const { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ member: data });
}
