import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { isValidIcalUrl, fetchIcal, syncIcalToEvents } from '@/lib/microsoftIcal';

/**
 * POST   /api/calendar/external   { memberId, icalUrl }   conecta URL externa
 * DELETE /api/calendar/external   { memberId }            desconecta
 *
 * Direção: provider externo (Google/Apple/Outlook/etc.) → EQR Agenda.
 *
 * Fluxo POST:
 *  1. Valida URL (https + bloqueia loopback/metadata pra evitar SSRF)
 *  2. Fetch da URL — confirma que retorna VCALENDAR
 *  3. Salva em calendar_provider_accounts (provider='microsoft' por compat, ical_url preenchida)
 *  4. Dispara sync inicial — eventos do feed aparecem no DB imediatamente
 *  5. Cron /api/cron/sync-ical re-sincroniza periodicamente
 *
 * Autorização: próprio member OU admin.
 */

const postBody = z.object({
  memberId: z.string().uuid(),
  icalUrl: z.string().min(1).max(2048),
});

const deleteBody = z.object({
  memberId: z.string().uuid(),
});

async function authorizeMember(req: NextRequest, targetMemberId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 } as const;

  const { data: rawMe } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = rawMe as { id: string; role: 'admin' | 'member' | 'employee' } | null;
  if (!me) return { error: 'Forbidden', status: 403 } as const;

  if (me.id !== targetMemberId && me.role !== 'admin') {
    return { error: 'Forbidden', status: 403 } as const;
  }
  return { ok: true } as const;
}

export async function POST(req: NextRequest) {
  const parsed = postBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { memberId, icalUrl } = parsed.data;
  const url = icalUrl.trim();

  const auth = await authorizeMember(req, memberId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!isValidIcalUrl(url)) {
    return NextResponse.json({ error: 'URL inválida. Precisa ser https://...' }, { status: 422 });
  }

  // Validação real — fetch e confirma VCALENDAR
  const fetched = await fetchIcal(url);
  if (!fetched.ok) {
    return NextResponse.json(
      { error: `Não consegui ler a URL: ${fetched.error}` },
      { status: 422 }
    );
  }

  const serviceDb = await getSupabaseServiceClient();

  // Upsert na calendar_provider_accounts — uma row iCal por member
  // (provider='microsoft' é compat histórica — a lib trata qualquer .ics)
  // Idempotência: se já existe row iCal pro member, atualiza URL.
  const { data: existing } = await serviceDb
    .from('calendar_provider_accounts')
    .select('id')
    .eq('member_id', memberId)
    .eq('provider', 'microsoft')
    .not('ical_url', 'is', null)
    .maybeSingle();

  if (existing) {
    const { error } = await serviceDb
      .from('calendar_provider_accounts')
      .update({ ical_url: url, sync_enabled: true })
      .eq('id', (existing as { id: string }).id);
    if (error) {
      console.error('[api/calendar/external POST] update failed', { memberId, error: error.message });
      return NextResponse.json({ error: 'Erro ao salvar URL' }, { status: 500 });
    }
  } else {
    const { error } = await serviceDb
      .from('calendar_provider_accounts')
      .insert({
        member_id: memberId,
        provider: 'microsoft',
        provider_email: 'ical-subscription',
        calendar_id: 'ical',
        ical_url: url,
        sync_enabled: true,
        is_primary: true,
      });
    if (error) {
      console.error('[api/calendar/external POST] insert failed', { memberId, error: error.message });
      return NextResponse.json({ error: 'Erro ao salvar URL' }, { status: 500 });
    }
  }

  // Marca member como linked + dispara sync inicial
  await serviceDb.from('members').update({ calendar_linked: true }).eq('id', memberId);

  const syncResult = await syncIcalToEvents(serviceDb, { memberId, icalUrl: url });
  if (!syncResult.ok) {
    // URL conectada mas sync falhou — não devolve erro fatal, só warning
    console.warn('[api/calendar/external POST] initial sync failed', { memberId, error: syncResult.error });
    return NextResponse.json({
      ok: true,
      eventsFound: fetched.events.length,
      synced: 0,
      warning: syncResult.error,
    });
  }

  return NextResponse.json({
    ok: true,
    eventsFound: fetched.events.length,
    synced: syncResult.synced,
    errors: syncResult.errors,
  });
}

export async function DELETE(req: NextRequest) {
  const parsed = deleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { memberId } = parsed.data;
  const auth = await authorizeMember(req, memberId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const serviceDb = await getSupabaseServiceClient();

  // Deleta APENAS rows iCal-only (mantém OAuth se houver)
  const { error: delErr } = await serviceDb
    .from('calendar_provider_accounts')
    .delete()
    .eq('member_id', memberId)
    .eq('provider', 'microsoft')
    .not('ical_url', 'is', null);

  if (delErr) {
    console.error('[api/calendar/external DELETE] failed', { memberId, error: delErr.message });
    return NextResponse.json({ error: 'Erro ao desconectar' }, { status: 500 });
  }

  // Reset calendar_linked SE não tem outro provider conectado
  const { data: remaining } = await serviceDb
    .from('calendar_provider_accounts')
    .select('id')
    .eq('member_id', memberId)
    .limit(1);
  if (((remaining ?? []) as Array<{ id: string }>).length === 0) {
    await serviceDb.from('members').update({ calendar_linked: false }).eq('id', memberId);
  }

  return NextResponse.json({ ok: true });
}
