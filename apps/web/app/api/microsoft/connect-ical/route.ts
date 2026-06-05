import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { isValidOutlookIcalUrl, fetchIcal, syncIcalToEvents } from '@/lib/microsoftIcal';

const bodySchema = z.object({
  icalUrl: z.string().url(),
});

/**
 * Conecta um sócio ao Outlook via iCal subscription URL.
 *
 * Body: { icalUrl: "https://outlook.office365.com/.../calendar.ics" }
 *
 * Fluxo:
 *  1. Valida URL (pattern Outlook)
 *  2. Faz fetch + parse pra confirmar que URL responde com iCal válido
 *  3. Upsert na tabela calendar_provider_accounts com ical_url
 *  4. Faz primeiro sync dos eventos
 *  5. Atualiza members.calendar_linked = true
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'URL inválida no body' }, { status: 400 });
  }
  const icalUrl = parsed.data.icalUrl.trim();

  if (!isValidOutlookIcalUrl(icalUrl)) {
    return NextResponse.json(
      {
        error:
          'URL não parece ser do Outlook. Esperado padrão "https://outlook.office365.com/.../calendar.ics" ou "https://outlook.live.com/owa/calendar/.../calendar.ics".',
      },
      { status: 400 }
    );
  }

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, name')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; name: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Valida que a URL realmente devolve iCal
  const fetched = await fetchIcal(icalUrl);
  if (!fetched.ok) {
    return NextResponse.json(
      { error: `Não consegui acessar a URL: ${fetched.error}` },
      { status: 400 }
    );
  }

  const serviceDb = await getSupabaseServiceClient();

  // Salva snapshot da row OAuth atual (se existir) antes de fazer mudanças,
  // pra restaurar caso o insert iCal falhe — evita perda de refresh_token válido.
  const { data: prevRows } = await serviceDb
    .from('calendar_provider_accounts')
    .select('*')
    .eq('member_id', member.id);
  const prevAccounts = (prevRows ?? []) as Array<Record<string, unknown>>;

  // DELETE atômico de tudo antes do INSERT — best-effort de transação na ausência
  // de RPC. Em caso de falha do INSERT, tentamos restaurar.
  const { error: delErr } = await serviceDb
    .from('calendar_provider_accounts')
    .delete()
    .eq('member_id', member.id);
  if (delErr) {
    return NextResponse.json(
      { error: `Erro ao limpar contas antigas: ${delErr.message}` },
      { status: 500 }
    );
  }

  // Insere nova row iCal — sem tokens OAuth
  const { error: insertErr } = await serviceDb
    .from('calendar_provider_accounts')
    .insert({
      member_id: member.id,
      provider: 'microsoft',
      provider_email: user.email ?? `${member.name}@ical.local`,
      calendar_id: 'ical',
      ical_url: icalUrl,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      is_primary: true,
      sync_enabled: true,
    });

  if (insertErr) {
    // Tenta restaurar as rows antigas pra não deixar sócio desconectado
    if (prevAccounts.length > 0) {
      const restoreError = await serviceDb
        .from('calendar_provider_accounts')
        .insert(prevAccounts as unknown as never)
        .then((r) => r.error)
        .catch(() => null);
      console.error('[connect-ical] insert falhou, restore attempt:', { insertErr: insertErr.message, restoreError: restoreError?.message });
    }
    return NextResponse.json(
      { error: `Erro ao salvar: ${insertErr.message}` },
      { status: 500 }
    );
  }

  // Marca member como vinculado
  const { error: memberErr } = await serviceDb
    .from('members')
    .update({ calendar_linked: true })
    .eq('id', member.id);
  if (memberErr) {
    console.error('[connect-ical] failed to flip calendar_linked', memberErr.message);
  }

  // Primeiro sync (best-effort, não bloqueia resposta se falhar)
  const sync = await syncIcalToEvents(serviceDb, { memberId: member.id, icalUrl });

  return NextResponse.json({
    ok: true,
    eventsFound: fetched.events.length,
    synced: sync.ok ? sync.synced : 0,
    errors: sync.ok ? sync.errors : 1,
  });
}
