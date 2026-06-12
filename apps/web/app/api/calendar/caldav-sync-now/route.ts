/**
 * POST /api/calendar/caldav-sync-now
 *
 * Dispara sync CalDAV imediato (bypassa o throttle in-memory do lazyReverseSync).
 *
 * Escopo:
 *   - User normal: roda pull + delete pra SUA própria conexão CalDAV
 *   - Admin: roda pra TODOS os sócios com CalDAV verificado
 *
 * Retorna resumo agregado (inserted/updated/deleted) pro toast de feedback na UI.
 *
 * Tipicamente chamado pelo botão "Sincronizar agora" no /calendar quando user
 * quer ver mudanças imediatas do Apple Calendar (criou evento direto no iPhone).
 */

import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { pullInboundFromCaldavForMember, pullInboundFromCaldavForAll } from '@/lib/caldav/pullInboundFromCaldav';
import { reverseSyncDeletesForMember, reverseSyncDeletesForAll } from '@/lib/caldav/reverseSyncDeletes';

export const maxDuration = 60;

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; role: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();

  try {
    // ORDEM: pull ANTES de reverse-delete (events inbound novos não devem
    // ficar expostos a delete acidental).
    if (member.role === 'admin') {
      // Admin: roda pra todos os sócios em paralelo (já é paralelo internamente)
      const pullResults = await pullInboundFromCaldavForAll(serviceDb);
      const deleteResults = await reverseSyncDeletesForAll(serviceDb);

      return NextResponse.json({
        ok: true,
        scope: 'all',
        pull: {
          processed: pullResults.length,
          inserted: pullResults.reduce((acc, r) => acc + r.inserted, 0),
          updated: pullResults.reduce((acc, r) => acc + r.updated, 0),
          deleted: pullResults.reduce((acc, r) => acc + r.deleted, 0),
          aborted: pullResults.filter((r) => r.reason === 'sanity-check-aborted').length,
        },
        delete: {
          processed: deleteResults.length,
          deleted: deleteResults.reduce((acc, r) => acc + r.deleted, 0),
          aborted: deleteResults.filter((r) => r.reason?.startsWith('sanity-check-aborted')).length,
        },
      });
    }

    // Sócio: roda só pra sua própria conexão
    const pullResult = await pullInboundFromCaldavForMember(serviceDb, member.id);
    const deleteResult = await reverseSyncDeletesForMember(serviceDb, member.id);

    return NextResponse.json({
      ok: true,
      scope: 'self',
      pull: {
        inserted: pullResult.inserted,
        updated: pullResult.updated,
        deleted: pullResult.deleted,
        reason: pullResult.reason ?? null,
      },
      delete: {
        deleted: deleteResult.deleted,
        reason: deleteResult.reason ?? null,
      },
    });
  } catch (err) {
    console.error('[api/calendar/caldav-sync-now] failed', {
      memberId: member.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar' },
      { status: 500 }
    );
  }
}
