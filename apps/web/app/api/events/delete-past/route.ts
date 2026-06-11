import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Apaga em lote todos os eventos cujo end_at < now.
 *
 * Apenas admin. Não propaga remoção pro Outlook (eventos passados não importam).
 *
 * Ordem importante:
 *   1. Marca meeting_requests aprovados como 'completed' e limpa resulting_event_id
 *      → satisfaz `mr_check_approved_has_event` (status != 'approved' OR event NOT NULL)
 *      → preserva histórico do request (não deleta o request, só transiciona status)
 *   2. Deleta events em batches
 *      → FKs em CASCADE (conflicts, participants, etc) limpam sozinhos
 *
 * Sem o passo 1, o ON DELETE SET NULL em meeting_requests.resulting_event_id
 * dispara o check constraint e o delete inteiro falha.
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

  // 2. Processa em batches: meeting_requests → events
  let deleted = 0;
  let archivedRequests = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);

    // 2a. Marca meeting_requests vinculados como 'completed' (libera o check)
    //     Update por batch evita ON DELETE SET NULL violar mr_check_approved_has_event
    const { error: mrErr, count: mrCount } = await serviceDb
      .from('meeting_requests')
      .update({ status: 'completed', resulting_event_id: null }, { count: 'exact' })
      .in('resulting_event_id', batch);
    if (mrErr) {
      console.error('[delete-past] meeting_requests UPDATE failed', {
        batchStart: i,
        batchSize: batch.length,
        code: mrErr.code,
        message: mrErr.message,
        hint: (mrErr as { hint?: string }).hint,
        partialDeleted: deleted,
        partialArchived: archivedRequests,
      });
      return NextResponse.json(
        {
          error: 'Erro ao arquivar solicitações vinculadas aos eventos passados',
          details: `${mrErr.code ?? ''} ${mrErr.message ?? mrErr}${(mrErr as { hint?: string }).hint ? ` (dica: ${(mrErr as { hint?: string }).hint})` : ''}`.trim(),
          partialDeleted: deleted,
        },
        { status: 500 }
      );
    }
    archivedRequests += mrCount ?? 0;

    // 2b. Agora deleta events — FKs em CASCADE limpam o resto (conflicts,
    //     event_participants, event_favorites, event_sync_log, notifications)
    const { error: delErr, count } = await serviceDb
      .from('events')
      .delete({ count: 'exact' })
      .in('id', batch);
    if (delErr) {
      console.error('[delete-past] events DELETE batch failed', {
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
          partialArchived: archivedRequests,
        },
        { status: 500 }
      );
    }
    deleted += count ?? batch.length;
  }

  return NextResponse.json({ ok: true, deleted, archivedRequests });
}
