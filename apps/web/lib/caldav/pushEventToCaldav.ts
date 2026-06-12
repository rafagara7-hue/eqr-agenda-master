/**
 * Push de evento pro CalDAV de cada participante conectado.
 *
 * Chamado depois de criar/atualizar event em /api/events. Pra cada participante
 * com caldav_connection ativa, faz:
 *   1. Decripta app-password
 *   2. Conecta ao iCloud
 *   3. PUT (ou UPDATE) o evento no calendar primary
 *   4. Grava last_sync_at ou last_error
 *
 * Falhas por participante são logadas mas não bloqueiam outros.
 * Falha completa não derruba a criação do event.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { decrypt } from '@/lib/email/cryptoUtil';
import { generateMeetingIcs, type MeetingInviteIcs } from '@/lib/email/generateMeetingIcs';
import { connectCalDAV, pushEvent } from './client';

type ServiceDb = SupabaseClient<Database>;

export interface PushOpts {
  eventId: string;
  eventTitle: string;
  eventDescription: string | null;
  eventLocation: string | null;
  eventStartAt: Date;
  eventEndAt: Date;
  /** Member IDs que vão receber o evento (incluindo host). */
  participantMemberIds: string[];
  /** Excluir o ator pra não enviar pra si mesmo. */
  actorMemberId: string;
  /** Organizer info pro .ics. */
  organizerName: string;
  organizerEmail: string;
  /**
   * external_provider do event. Quando é 'apple_caldav', o event veio do pull
   * inbound — NÃO devemos pushar de volta pro Apple (causaria loop infinito).
   */
  externalProvider?: 'google' | 'microsoft' | 'apple_caldav' | null;
}

interface CaldavConnRow {
  id: string;
  member_id: string;
  apple_id_email: string;
  app_password_encrypted: string;
  calendar_url: string | null;
}

interface MemberRow {
  id: string;
  name: string;
  user_id: string | null;
}

/**
 * Resumo do push CalDAV — usado pelo caller pra computar o events.sync_status
 * final combinando com Microsoft.
 * - attempted=false: nenhum recipient tem CalDAV verificado (no-op)
 * - attempted=true, anySuccess=true: ao menos 1 conn recebeu o evento
 * - attempted=true, anyFailure=true: ao menos 1 conn falhou
 *   (anySuccess e anyFailure podem ser ambos true em reunião conjunta parcial)
 */
export interface CaldavPushResult {
  attempted: boolean;
  anySuccess: boolean;
  anyFailure: boolean;
}

export async function pushEventToCaldavConnections(
  serviceDb: ServiceDb,
  opts: PushOpts
): Promise<CaldavPushResult> {
  let anySuccess = false;
  let anyFailure = false;
  try {
    // Diferença importante vs email: aqui NÃO filtramos o actor.
    // Email .ics: não notifica o próprio criador (faz sentido — ele sabe).
    // CalDAV: empurra pra calendar de TODOS os participantes (host + extras),
    // inclusive se for o próprio criador. O Apple Calendar do sócio é o
    // calendário-fonte-da-verdade dele — quer ver tudo que tá na EQR Agenda.
    // ANTI-LOOP: event veio do pull inbound (Apple-sourced). Pushar de volta
    // criaria loop infinito (push → Apple → pull → INSERT → push…). Return early.
    if (opts.externalProvider === 'apple_caldav') {
      return { attempted: false, anySuccess: false, anyFailure: false };
    }

    const recipientIds = Array.from(new Set(opts.participantMemberIds));
    if (recipientIds.length === 0) return { attempted: false, anySuccess: false, anyFailure: false };

    // Busca conexões CalDAV verificadas dos recipients
    const { data: rawConns } = await serviceDb
      .from('caldav_connections')
      .select('id, member_id, apple_id_email, app_password_encrypted, calendar_url')
      .in('member_id', recipientIds)
      .not('verified_at', 'is', null);
    const conns = (rawConns ?? []) as CaldavConnRow[];
    if (conns.length === 0) return { attempted: false, anySuccess: false, anyFailure: false };

    // Busca nomes dos members + emails pra montar attendees corretos
    const { data: rawMembers } = await serviceDb
      .from('members')
      .select('id, name, user_id')
      .in('id', recipientIds);
    const members = (rawMembers ?? []) as MemberRow[];
    const memberById = new Map(members.map((m) => [m.id, m]));

    const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

    await Promise.allSettled(
      conns
        .filter((c) => c.calendar_url) // só conn com calendar_url descoberto
        .map(async (conn) => {
          const member = memberById.get(conn.member_id);
          if (!member) return;
          try {
            // Decripta password
            const appPassword = decrypt(conn.app_password_encrypted);

            // Email do destinatário (pra ATTENDEE no .ics)
            let recipientEmail = conn.apple_id_email;
            if (member.user_id) {
              const { data: userResp } = await serviceDb.auth.admin.getUserById(member.user_id);
              recipientEmail = userResp?.user?.email ?? conn.apple_id_email;
            }

            // Gera .ics — METHOD:REQUEST (default). Empiricamente Apple iCloud
            // aceita REQUEST e persiste o VEVENT (testado em 2026-06-11 com
            // Aluísio). Mudança pra PUBLISH causou regressão (silent discard
            // caught pelo post-PUT verification em 2026-06-12). PUBLISH ficou
            // como override opcional no MeetingInviteIcs caso seja útil futuro.
            const invite: MeetingInviteIcs = {
              uid: `${opts.eventId}@${host}`,
              title: opts.eventTitle,
              description: opts.eventDescription,
              location: opts.eventLocation,
              startAt: opts.eventStartAt,
              endAt: opts.eventEndAt,
              organizer: {
                name: opts.organizerName,
                email: opts.organizerEmail,
              },
              attendees: [{ name: member.name, email: recipientEmail, rsvp: false }],
              status: 'CONFIRMED',
              url: `https://${host}/meetings/${opts.eventId}`,
            };
            const ics = generateMeetingIcs(invite);

            // Conecta CalDAV
            const result = await connectCalDAV({
              appleIdEmail: conn.apple_id_email,
              appPassword,
            });
            if (!result.ok) {
              anyFailure = true;
              await serviceDb
                .from('caldav_connections')
                .update({ last_error: `connect: ${result.error}`, last_sync_at: null })
                .eq('id', conn.id);
              console.warn('[caldav/push] connect failed', {
                memberId: conn.member_id,
                appleIdEmail: conn.apple_id_email,
                calendarUrl: conn.calendar_url,
                code: result.code,
                error: result.error,
              });
              return;
            }

            // Push event
            const push = await pushEvent(
              result.client,
              conn.calendar_url!,
              opts.eventId,
              ics
            );
            if (!push.ok) {
              anyFailure = true;
              await serviceDb
                .from('caldav_connections')
                .update({ last_error: `push: ${push.error}` })
                .eq('id', conn.id);
              console.warn('[caldav/push] push failed', {
                memberId: conn.member_id,
                eventId: opts.eventId,
                calendarUrl: conn.calendar_url,
                error: push.error,
              });
              return;
            }

            // Sucesso
            anySuccess = true;
            await serviceDb
              .from('caldav_connections')
              .update({
                last_sync_at: new Date().toISOString(),
                last_error: null,
              })
              .eq('id', conn.id);
          } catch (err) {
            anyFailure = true;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[caldav/push] exception per recipient', {
              memberId: conn.member_id,
              error: errMsg,
            });
            // Bug histórico: o catch antigo só logava no console (invisível em prod
            // sem acesso a logs Vercel). Agora também grava no last_error pra
            // diagnosticar via banco quando algo falha.
            try {
              await serviceDb
                .from('caldav_connections')
                .update({ last_error: `exception: ${errMsg.slice(0, 500)}` })
                .eq('id', conn.id);
            } catch {
              // se o update também falhar, não tem o que fazer
            }
          }
        })
    );
    return { attempted: true, anySuccess, anyFailure };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[caldav/push] outer error', {
      eventId: opts.eventId,
      error: errMsg,
    });
    // Tenta gravar o erro pra todas as conn dos recipients (se conseguir
    // identificar quais). Isso garante visibilidade quando o erro acontece
    // ANTES do loop por-conn (ex: query SQL falha, decrypt key issue, etc.).
    try {
      const recipientIds = opts.participantMemberIds.filter(
        (id) => id !== opts.actorMemberId
      );
      if (recipientIds.length > 0) {
        await serviceDb
          .from('caldav_connections')
          .update({ last_error: `outer: ${errMsg.slice(0, 500)}` })
          .in('member_id', recipientIds)
          .not('verified_at', 'is', null);
      }
    } catch {
      // se nem isso funcionar, não tem o que fazer
    }
    // Outer fail = não conseguimos nem iniciar o push. Reportamos como no-op
    // pro caller (não queremos forçar sync_status='failed' por causa de erro
    // que pode ser apenas transiente — Microsoft sync ainda pode marcar synced).
    return { attempted: false, anySuccess: false, anyFailure: false };
  }
}
