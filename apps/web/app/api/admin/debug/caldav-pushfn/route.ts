/**
 * TEMP: Chama a funcao pushEventToCaldavConnections EXATAMENTE como o
 * /api/events faz. Usa parametros sinteticos pra Aluisio.
 *
 * Depois consulta o estado da row pra ver se last_sync_at ou last_error
 * foi atualizado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { pushEventToCaldavConnections } from '@/lib/caldav/pushEventToCaldav';

export async function GET(req: NextRequest) {
  if (req.headers.get('x-debug-token') !== process.env['DEBUG_TOKEN']) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();

  // Snapshot ANTES
  const { data: before } = await serviceDb
    .from('caldav_connections')
    .select('last_sync_at, last_error, updated_at')
    .eq('member_id', memberId)
    .maybeSingle();

  const eventId = `debug-pushfn-${Date.now()}`;
  const startAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  // Acta como admin (qualquer outro member id que não seja o do recipient)
  const actorMemberId = 'b1000000-0000-0000-0000-000000000001'; // Amina

  const startedAt = new Date().toISOString();
  try {
    await pushEventToCaldavConnections(serviceDb, {
      eventId,
      eventTitle: 'Debug PushFn Test',
      eventDescription: 'Testando a funcao push direto',
      eventLocation: 'debug',
      eventStartAt: startAt,
      eventEndAt: endAt,
      participantMemberIds: [memberId],
      actorMemberId,
      organizerName: 'EQR Debug',
      organizerEmail: 'debug@eqr.com.br',
    });
  } catch (err) {
    return NextResponse.json({
      step: 'pushEventToCaldavConnections',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.substring(0, 1500) : undefined,
    });
  }
  const finishedAt = new Date().toISOString();

  // Snapshot DEPOIS
  const { data: after } = await serviceDb
    .from('caldav_connections')
    .select('last_sync_at, last_error, updated_at')
    .eq('member_id', memberId)
    .maybeSingle();

  return NextResponse.json({
    fn_call: { startedAt, finishedAt },
    test_event_id: eventId,
    before,
    after,
    changed: JSON.stringify(before) !== JSON.stringify(after),
  });
}
