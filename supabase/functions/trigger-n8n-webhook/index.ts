import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET') ?? '';
const N8N_BASE_URL = Deno.env.get('N8N_BASE_URL') ?? '';

const OPERATION_WEBHOOK_MAP: Record<string, string> = {
  INSERT: '/webhook/event-create',
  UPDATE: '/webhook/event-update',
  DELETE: '/webhook/event-delete',
};

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return 'sha256=' + Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const operation = (body['type'] as string | undefined) ?? 'UNKNOWN';
  const record = body['record'] as Record<string, unknown> | undefined;
  const oldRecord = body['old_record'] as Record<string, unknown> | undefined;

  const webhookPath = OPERATION_WEBHOOK_MAP[operation];
  if (!webhookPath) {
    return new Response('Unknown operation', { status: 400 });
  }

  // Para DELETE, precisamos do snapshot do old_record pois o row foi removido
  const eventData = operation === 'DELETE' ? oldRecord : record;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Enriquece payload com dados da conta de calendário do membro (Outlook/Microsoft)
  let calendarAccount = null;
  if (eventData?.['member_id']) {
    const { data } = await supabase
      .from('calendar_provider_accounts')
      .select('id, provider, calendar_id, account_email, sync_enabled, token_expires_at')
      .eq('member_id', eventData['member_id'])
      .eq('provider', 'microsoft')
      .eq('is_primary', true)
      .single();
    calendarAccount = data;
  }

  const payload = {
    operation,
    event: eventData,
    calendar_account: calendarAccount,
    timestamp: new Date().toISOString(),
  };

  const payloadStr = JSON.stringify(payload);
  const signature = await signPayload(payloadStr, N8N_WEBHOOK_SECRET);

  // Fire-and-forget: não bloqueia a transaction do banco
  const n8nUrl = `${N8N_BASE_URL}${webhookPath}`;
  fetch(n8nUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EQR-Signature': signature,
      'X-EQR-Operation': operation,
    },
    body: payloadStr,
  }).catch((err: Error) => {
    console.error('Failed to call N8N webhook:', err.message);
  });

  return new Response(JSON.stringify({ ok: true, operation }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
