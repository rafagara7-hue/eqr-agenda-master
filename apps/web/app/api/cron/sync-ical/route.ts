import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { syncAllIcalSubscriptions } from '@/lib/microsoftIcal';

// Permite cron rodar até 5 minutos (Vercel default é 10s no Hobby).
// Necessário pra sync de 5+ sócios com Outlook lento (até 15s cada).
export const maxDuration = 300;

// Comparação constant-time pra evitar timing attack
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Cron Vercel: roda a cada 30min e sincroniza todos sócios com iCal URL.
 *
 * Segurança:
 *   - Em produção, CRON_SECRET é OBRIGATÓRIO (fail-closed). Sem ele, endpoint 503.
 *   - Vercel injeta header "Authorization: Bearer <CRON_SECRET>" automaticamente.
 *   - Comparação constant-time (crypto.timingSafeEqual).
 *
 * Configuração: vercel.json define o schedule.
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
  const result = await syncAllIcalSubscriptions(serviceDb);

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    totalSynced: result.totalSynced,
    totalErrors: result.totalErrors,
    timestamp: new Date().toISOString(),
  });
}
