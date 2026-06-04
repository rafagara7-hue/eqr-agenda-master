/**
 * Rate limit in-memory simples por chave (IP/header).
 *
 * Limitacoes:
 * - State eh per-instance — em serverless escala horizontal, cada instancia
 *   tem seu proprio bucket. Subestima limite real sob trafego distribuido.
 * - Reset no restart do processo.
 *
 * Adequado pra MVP de form publico /agendar. Upgrade path: Upstash Ratelimit
 * com Redis quando trafego justificar.
 *
 * Para abuse-resistente real, combinar com captcha (Turnstile/hCaptcha) +
 * origin check + honeypot.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup periodico pra evitar memory leak. unref() pra nao bloquear shutdown.
let cleanupStarted = false;
function ensureCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }, 60_000);
  if (typeof interval.unref === 'function') interval.unref();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

/**
 * Sliding-ish window. Cada chave tem 1 bucket; quando estoura, retorna ok=false
 * ate o reset (windowMs apos o primeiro hit).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const newBucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, newBucket);
    return { ok: true, remaining: limit - 1, resetAt: newBucket.resetAt, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt, retryAfterMs: 0 };
}

/** Extrai IP do request — usa X-Forwarded-For (Vercel) ou fallback. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() ?? 'unknown';
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

/** Valida origin do request contra a app URL. Retorna true se OK. */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  // Same-origin (server-side fetch) frequentemente nao envia origin — aceita
  if (!origin) return true;
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? process.env['VERCEL_URL'] ?? '';
  if (!appUrl) return true; // sem config, nao bloqueia
  try {
    const allowed = new URL(appUrl.startsWith('http') ? appUrl : `https://${appUrl}`);
    const got = new URL(origin);
    return allowed.hostname === got.hostname;
  } catch {
    return false;
  }
}
