import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

const BUCKET = 'avatars';
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawCurrentMember, error: meErr } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  if (meErr && meErr.code !== 'PGRST116') {
    console.error('[api/members/[id]/avatar/POST] me lookup failed', { userId: user.id, code: meErr.code });
    return NextResponse.json({ error: 'Erro ao validar permissão' }, { status: 500 });
  }
  const currentMember = rawCurrentMember as { id: string; role: string } | null;

  if (!currentMember) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
  if (currentMember.role !== 'admin' && currentMember.id !== id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Apenas imagens são permitidas' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande (máximo 2 MB)' }, { status: 400 });
  }

  const service = await getSupabaseServiceClient();

  // Cria o bucket se ainda não existir
  await service.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_SIZE });

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const path = `${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { data: upload, error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Adiciona cache-buster para forçar recarga da imagem no browser
  const pubResult = service.storage.from(BUCKET).getPublicUrl(upload.path);
  const publicUrl = pubResult.data?.publicUrl;
  if (!publicUrl) {
    console.error('[api/members/[id]/avatar/POST] getPublicUrl returned no url', { memberId: id, path: upload.path });
    return NextResponse.json({ error: 'Erro ao gerar URL do avatar' }, { status: 500 });
  }
  const url = `${publicUrl}?t=${Date.now()}`;

  return NextResponse.json({ url });
}
