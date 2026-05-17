import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';

const N8N_WEBHOOK_SECRET = process.env['N8N_WEBHOOK_SECRET'] ?? '';

async function verifySignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  const expected = signatureHeader.replace('sha256=', '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(N8N_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return computed === expected;
}

interface N8NInboundPayload {
  operation: 'create' | 'update' | 'delete' | 'sync_status';
  event?: {
    member_id: string;
    google_event_id?: string;
    title?: string;
    start_at?: string;
    end_at?: string;
  };
  eventId?: string;
  googleEventId?: string;
  syncStatus?: 'synced' | 'failed' | 'conflict';
  syncError?: string;
  adminMemberId?: string;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-EQR-Signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const rawBody = await req.text();

  const isValid = await verifySignature(rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: N8NInboundPayload;
  try {
    payload = JSON.parse(rawBody) as N8NInboundPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const serviceDb = await getSupabaseServiceClient();

  try {
    if (payload.operation === 'sync_status' && payload.eventId) {
      // N8N informa o resultado do sync (sucesso ou falha)
      const { error } = await serviceDb
        .from('events')
        .update({
          sync_status: payload.syncStatus ?? 'synced',
          google_event_id: payload.googleEventId,
          sync_error: payload.syncError ?? null,
          last_synced_at: payload.syncStatus === 'synced' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.eventId);

      if (error) throw new Error(error.message);

      // Loga o resultado do sync
      if (payload.eventId && payload.event?.member_id) {
        await serviceDb.from('event_sync_log').insert({
          event_id: payload.eventId,
          member_id: payload.event.member_id,
          operation: 'inbound',
          direction: 'inbound',
          source: 'n8n',
          status: payload.syncStatus === 'synced' ? 'success' : 'failed',
          google_event_id: payload.googleEventId ?? null,
          error_message: payload.syncError ?? null,
        });
      }
    } else if (payload.operation === 'create' && payload.event) {
      // Criação inbound do Google Calendar
      const adminId = payload.adminMemberId ?? '';
      const service = new EventService({
        db: serviceDb,
        actorId: adminId,
        actorRole: 'admin',
      });

      if (payload.event.title && payload.event.start_at && payload.event.end_at) {
        await service.applyInboundSync(
          payload.event.google_event_id ?? '',
          payload.event.member_id,
          {
            memberId: payload.event.member_id,
            createdBy: adminId,
            title: payload.event.title,
            startAt: new Date(payload.event.start_at),
            endAt: new Date(payload.event.end_at),
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
