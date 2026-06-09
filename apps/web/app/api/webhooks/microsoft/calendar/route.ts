import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { syncCreateToMicrosoft } from '@/lib/microsoftSync';

/**
 * Webhook handler do Microsoft Graph para eventos de calendar.
 *
 * Fluxo Microsoft:
 *  1. Criamos subscription via Graph API: POST /subscriptions com notificationUrl
 *     apontando pra ESTE endpoint
 *  2. Microsoft faz GET com ?validationToken=... — devemos responder text/plain echo
 *     em até 10s (validation handshake)
 *  3. Microsoft faz POST com payload de notification quando evento muda:
 *     { value: [{ subscriptionId, clientState, resource, changeType, resourceData... }] }
 *  4. Validamos clientState (constant-time compare) e processamos
 *
 * Segurança:
 *  - clientState armazenado em calendar_provider_accounts.subscription_state quando
 *    a subscription foi criada. Comparamos com constant-time.
 *  - Endpoint público (matcher do middleware já exclui /api/webhooks/*)
 *
 * Performance:
 *  - Cold start Vercel pode ser ~500ms-2s. Validation handshake tem deadline 10s,
 *    então ok. Notificação não bloqueia — processamos async.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Handshake de validação — Microsoft faz GET com ?validationToken=X
export async function GET(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new NextResponse('Webhook endpoint ativo', { status: 200 });
}

interface NotificationPayload {
  value: Array<{
    subscriptionId: string;
    subscriptionExpirationDateTime: string;
    changeType: 'created' | 'updated' | 'deleted';
    resource: string;
    clientState: string;
    resourceData?: {
      '@odata.type'?: string;
      '@odata.id'?: string;
      id?: string;
    };
  }>;
  validationTokens?: string[];
}

// Notification — Microsoft faz POST quando evento muda
export async function POST(req: NextRequest) {
  // Microsoft pode mandar validationToken em URL params no POST tb (lifecycle notification)
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let payload: NotificationPayload;
  try {
    payload = (await req.json()) as NotificationPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.value || !Array.isArray(payload.value)) {
    return NextResponse.json({ error: 'Missing value array' }, { status: 400 });
  }

  const supabase = await getSupabaseServiceClient();

  // Processa cada notification
  for (const notification of payload.value) {
    try {
      // Busca account pelo subscription_id pra validar clientState
      const { data: rawAccount } = await supabase
        .from('calendar_provider_accounts')
        .select('id, member_id, provider, metadata')
        .eq('subscription_id', notification.subscriptionId)
        .maybeSingle();

      const account = rawAccount as {
        id: string;
        member_id: string;
        provider: string;
        metadata: Record<string, unknown> | null;
      } | null;

      if (!account) {
        console.warn('[webhook microsoft] subscription not found', {
          subscriptionId: notification.subscriptionId,
        });
        continue;
      }

      // Valida clientState — defesa contra notification forjada
      const expectedClientState = (account.metadata?.['microsoftClientState'] as string | undefined) ?? '';
      if (!expectedClientState || !safeEqual(notification.clientState, expectedClientState)) {
        console.error('[webhook microsoft] clientState mismatch', {
          subscriptionId: notification.subscriptionId,
          accountId: account.id,
        });
        continue;
      }

      // Resource format: /users/{userId}/events/{eventId} ou /me/events/{eventId}
      const eventIdMatch = notification.resource.match(/events\/([^/]+)/);
      const eventId = eventIdMatch?.[1];
      if (!eventId) {
        console.warn('[webhook microsoft] unable to parse event id', { resource: notification.resource });
        continue;
      }

      console.log('[webhook microsoft] notification received', {
        memberId: account.member_id,
        eventId,
        changeType: notification.changeType,
      });

      // TODO: fazer fetch do evento atualizado e upsert em events.
      // Implementação completa requer fetchEventById helper em microsoft.ts +
      // map pra schema interno. Por ora deixamos o log pra confirmar entrega.
    } catch (err) {
      console.error('[webhook microsoft] processing error', {
        error: err instanceof Error ? err.message : err,
      });
      // Não fazemos return — processa próximas notifications mesmo com erro
    }
  }

  // Microsoft espera 200/202 rápido. Processamento real pode continuar async.
  return new NextResponse(null, { status: 202 });
}
