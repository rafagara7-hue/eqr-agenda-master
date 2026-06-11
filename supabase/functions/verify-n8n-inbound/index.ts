const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET') ?? '';

// Constant-time bytewise compare (mitiga timing attack na verificação HMAC).
function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

async function verifySignature(payload: string, signatureHeader: string, secret: string): Promise<boolean> {
  // Fail-closed se secret não estiver configurado ou for fraco.
  if (!secret || secret.length < 32) return false;
  const expected = signatureHeader.replace('sha256=', '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computed = new Uint8Array(sig);
  const expectedBytes = hexToBytes(expected);
  if (!expectedBytes) return false;
  return timingSafeBytesEqual(computed, expectedBytes);
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
