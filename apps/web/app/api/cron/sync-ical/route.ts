import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { syncAllIcalSubscriptions } from '@/lib/microsoftIcal';
import { renewExpiringMicrosoftSubscriptions } from '@/lib/microsoftSubscriptions';
import { reverseSyncDeletesForAll } from '@/lib/caldav/reverseSyncDeletes';
import { pullInboundFromCaldavForAll } from '@/lib/caldav/pullInboundFromCaldav';

// Permite cron rodar até 5 minutos (Vercel default é 10s no Hobby).
// Necessário pra sync de 5+ sócios com Outlook lento (até 15s cada).
export const maxDuration = 300;

// Comparação constant-time pra evitar timing attack
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Cron Vercel: a cada 6h sincroniza iCal subscriptions + renova webhooks Microsoft.
 *
 * Dois caminhos rodam em paralelo:
 *   1. syncAllIcalSubscriptions — pulls .ics de Google/Apple/Outlook publicado
 *   2. renewExpiringMicrosoftSubscriptions — renova Graph subscriptions <24h
 *      de expirar (TTL Microsoft = 3 dias)
 *
 * Segurança:
 *   - Em produção, CRON_SECRET é OBRIGATÓRIO (fail-closed). Sem ele, endpoint 503.
 *   - Vercel injeta header "Authorization: Bearer <CRON_SECRET>" automaticamente.
 *   - Comparação constant-time (crypto.timingSafeEqual).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env['CRON_SECRET'];

  if (!cronSecret) {
    // Fail-closed em produção: NÃO aceita invocação se secret não foi configurado
    if (process.env['NODE_ENV'] === 'production') {
      return NextResponse.json(
        { error: 'CRON_SECRET não configurado em produção' },
        { status: 503 }
      );
    }
    // Em dev/test, permite sem auth pra facilitar (console.warn alerta)
    console.warn('[cron/sync-ical] CRON_SECRET vazio — rodando sem auth (dev/test only)');
  } else {
    const authHeader = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${cronSecret}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const serviceDb = await getSupabaseServiceClient();

  // ORDEM IMPORTANTE: pull inbound RODA ANTES do reverse-delete pra que
  // events Apple-sourced inseridos não fiquem expostos a delete acidental.
  // Pull é sequencial-isolado; depois as outras 3 tarefas rodam em paralelo.
  const caldavInboundResult = await pullInboundFromCaldavForAll(serviceDb).catch((err) => {
    console.warn('[cron/sync-ical] pull inbound failed', err);
    return [] as Awaited<ReturnType<typeof pullInboundFromCaldavForAll>>;
  });

  // Roda iCal sync + Microsoft subscription renewal + CalDAV reverse-sync em paralelo.
  // Se um falhar, os outros seguem — Promise.allSettled isola falhas.
  const [icalResult, msResult, caldavReverseResult] = await Promise.allSettled([
    syncAllIcalSubscriptions(serviceDb),
    renewExpiringMicrosoftSubscriptions(serviceDb),
    reverseSyncDeletesForAll(serviceDb),
  ]);

  // Helper: Promise.allSettled.reason pode ser qualquer coisa (não só Error).
  const reasonMsg = (r: unknown) =>
    r instanceof Error ? r.message : typeof r === 'string' ? r : 'unknown error';

  const ical = icalResult.status === 'fulfilled'
    ? { processed: icalResult.value.processed, synced: icalResult.value.totalSynced, errors: icalResult.value.totalErrors }
    : { processed: 0, synced: 0, errors: 1, fail: reasonMsg(icalResult.reason) };

  const microsoft = msResult.status === 'fulfilled'
    ? { renewed: msResult.value.renewed, errors: msResult.value.errors, skipped: msResult.value.skipped }
    : { renewed: 0, errors: 1, skipped: 0, fail: reasonMsg(msResult.reason) };

  const caldavReverse = caldavReverseResult.status === 'fulfilled'
    ? {
        processed: caldavReverseResult.value.length,
        deleted: caldavReverseResult.value.reduce((acc, r) => acc + r.deleted, 0),
        skipped: caldavReverseResult.value.reduce((acc, r) => acc + r.skipped, 0),
        aborted: caldavReverseResult.value.filter((r) => r.reason?.startsWith('sanity-check-aborted')).length,
      }
    : { processed: 0, deleted: 0, skipped: 0, aborted: 0, fail: reasonMsg(caldavReverseResult.reason) };

  // Agrega resultado do pull inbound (já resolvido antes do allSettled)
  const caldavInbound = {
    processed: caldavInboundResult.length,
    inserted: caldavInboundResult.reduce((acc, r) => acc + r.inserted, 0),
    updated: caldavInboundResult.reduce((acc, r) => acc + r.updated, 0),
    deleted: caldavInboundResult.reduce((acc, r) => acc + r.deleted, 0),
    aborted: caldavInboundResult.filter((r) => r.reason === 'sanity-check-aborted').length,
  };

  return NextResponse.json({
    ok: true,
    ical,
    microsoft,
    caldavReverse,
    caldavInbound,
    timestamp: new Date().toISOString(),
  });
}
