const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET') ?? '';

async function verifySignature(payload: string, signatureHeader: string, secret: string): Promise<boolean> {
  const expected = signatureHeader.replace('sha256=', '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return computed === expected;
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('X-EQR-Signature');
  if (!signature) {
    return new Response(JSON.stringify({ valid: false, reason: 'missing_signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const isValid = await verifySignature(rawBody, signature, N8N_WEBHOOK_SECRET);

  if (!isValid) {
    return new Response(JSON.stringify({ valid: false, reason: 'invalid_signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ valid: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
