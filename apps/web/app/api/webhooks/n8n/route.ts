import { type NextRequest, NextResponse } from 'next/server';
import nodeCrypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';

const N8N_WEBHOOK_SECRET = process.env['N8N_WEBHOOK_SECRET'] ?? '';

// Constant-time hex parse — Buffer.from(hex) tem fast-path que pode vazar
// timing pelo padrão da string. Aqui parse byte a byte sem branch baseado
// no valor (apenas erro grosseiro de formato é early-out).
function hexToBytesConstantTime(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = parseInt(hex[i * 2] ?? '', 16);
    const lo = parseInt(hex[i * 2 + 1] ?? '', 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
    out[i] = (hi << 4) | lo;
  }
  return out;
}

// Comparação constant-time pra hex strings — evita timing attack na
// verificação de assinatura HMAC do webhook.
function timingSafeHexEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  const aBytes = hexToBytesConstantTime(a);
  const bBytes = hexToBytesConstantTime(b);
  if (!aBytes || !bBytes || aBytes.length !== bBytes.length) return false;
  return nodeCrypto.timingSafeEqual(aBytes, bBytes);
}

async function verifySignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  // Fail-closed se secret não estiver configurado em prod.
  if (!N8N_WEBHOOK_SECRET || N8N_WEBHOOK_SECRET.length < 32) return false;
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
  return timingSafeHexEqual(computed, expected);
}

interface N8NInboundPayload {
  operation: 'create' | 'update' | 'delete' | 'sync_status';
  event?: {
    member_id: string;
    external_event_id?: string;
    external_provider?: 'google' | 'microsoft';
    title?: string;
    start_at?: string;
    end_at?: string;
  };
  eventId?: string;
  externalEventId?: string;
  externalProvider?: 'google' | 'microsoft';
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
          external_event_id: payload.externalEventId,
          external_provider: payload.externalProvider ?? 'microsoft',
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
          external_event_id: payload.externalEventId ?? null,
          error_message: payload.syncError ?? null,
        });
      }
    } else if (payload.operation === 'create' && payload.event) {
      // Criação inbound do Outlook Calendar
      const adminId = payload.adminMemberId ?? '';
      const service = new EventService({
        db: serviceDb,
        actorId: adminId,
        actorRole: 'admin',
      });

      if (payload.event.title && payload.event.start_at && payload.event.end_at) {
        await service.applyInboundSync(
          payload.event.external_event_id ?? '',
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
