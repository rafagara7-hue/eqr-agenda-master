import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Apaga em lote todos os eventos cujo end_at < now.
 * Apenas admin. Não propaga a remoção para o Outlook Calendar (eventos passados
 * são irrelevantes lá; manter performance).
 *
 * Estratégia em batches de 500 pra:
 *   - evitar payload muito grande em UPDATE/DELETE
 *   - ter feedback parcial em caso de falha mid-batch
 *
 * Em caso de erro, retorna:
 *   { error: "mensagem amigável", details: "código + mensagem real do PG" }
 */

const BATCH_SIZE = 500;

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
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceDb = await getSupabaseServiceClient();
  const cutoff = new Date().toISOString();

  // 1. Lista IDs dos eventos passados
  const { data: rows, error: selErr } = await serviceDb
    .from('events')
    .select('id')
    .lt('end_at', cutoff);
  if (selErr) {
    console.error('[delete-past] SELECT failed', selErr);
    return NextResponse.json(
      {
        error: 'Erro ao listar eventos passados',
        details: `${selErr.code ?? ''} ${selErr.message ?? selErr}`.trim(),
      },
      { status: 500 }
    );
  }

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  // 2. Apaga em batches — facilita identificar batch problema se quebrar
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error: delErr, count } = await serviceDb
      .from('events')
      .delete({ count: 'exact' })
      .in('id', batch);

    if (delErr) {
      console.error('[delete-past] DELETE batch failed', {
        batchStart: i,
        batchSize: batch.length,
        firstId: batch[0],
        code: delErr.code,
        message: delErr.message,
        hint: (delErr as { hint?: string }).hint,
        partialDeleted: deleted,
      });
      return NextResponse.json(
        {
          error: 'Erro ao apagar eventos passados',
          details: `${delErr.code ?? ''} ${delErr.message ?? delErr}${(delErr as { hint?: string }).hint ? ` (dica: ${(delErr as { hint?: string }).hint})` : ''}`.trim(),
          partialDeleted: deleted,
        },
        { status: 500 }
      );
    }
    deleted += count ?? batch.length;
  }

  return NextResponse.json({ ok: true, deleted });
}
