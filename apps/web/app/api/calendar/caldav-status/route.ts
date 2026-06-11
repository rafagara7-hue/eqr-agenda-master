/**
 * GET /api/calendar/caldav-status?memberId=<uuid>
 *
 * Retorna apenas { memberId, connected: boolean } pra qualquer usuário autenticado.
 *
 * Por quê separado de /api/calendar/caldav?
 *   - /api/calendar/caldav (GET sem query) é mais rico (email, calendar_url, last_sync_at)
 *     e exige RLS de own-or-admin.
 *   - Aqui qualquer sócio precisa saber se o OUTRO sócio tá conectado (pra UI do
 *     painel de perfil). Retornamos só boolean — zero PII.
 *
 * Auth: middleware já garante usuário logado em /api/* (não-público).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId || !/^[0-9a-f-]{36}$/i.test(memberId)) {
    return NextResponse.json({ error: 'memberId inválido' }, { status: 400 });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data } = await serviceDb
    .from('caldav_connections')
    .select('verified_at')
    .eq('member_id', memberId)
    .maybeSingle();

  const row = data as { verified_at: string | null } | null;
  return NextResponse.json({ memberId, connected: !!row?.verified_at });
}
