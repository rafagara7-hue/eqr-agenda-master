import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';
import { z } from 'zod';
import { syncCreateToMicrosoft } from '@/lib/microsoftSync';
import { sendMeetingInvite } from '@/lib/email/sendMeetingInvite';
import { pushEventToCaldavConnections } from '@/lib/caldav/pushEventToCaldav';

const reminderSchema = z.object({
  method: z.enum(['popup', 'email']),
  minutes: z.number().int().min(0).max(40320), // 0 até 4 semanas
});

const createSchema = z.object({
  memberId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).max(20).optional(),
  participantsCanEdit: z.boolean().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  reminders: z.array(reminderSchema).max(5).optional(),
});

type ServiceDb = Awaited<ReturnType<typeof getSupabaseServiceClient>>;

async function insertCreatedNotifications(
  serviceDb: ServiceDb,
  opts: { eventId: string; eventTitle: string; participantIds: string[]; actorMemberId: string; actorRole: string }
) {
  const rows: Array<{
    member_id: string; type: string; title: string; body: string; event_id: string | null;
  }> = [];

  const isJoint = opts.participantIds.length > 1;
  const baseTitle = isJoint ? 'Você foi incluído em uma reunião' : 'Evento criado';

  // Notify every participant (except the actor themselves)
  for (const pid of opts.participantIds) {
    if (pid === opts.actorMemberId) continue;
    rows.push({
      member_id: pid,
      type: 'event_created',
      title: baseTitle,
      body: opts.eventTitle,
      event_id: opts.eventId,
    });
  }

  // If actor is a regular member, also notify all admins
  if (opts.actorRole !== 'admin') {
    const [actorRes, adminsRes] = await Promise.all([
      serviceDb.from('members').select('name').eq('id', opts.actorMemberId).single(),
      serviceDb.from('members').select('id').eq('role', 'admin').eq('is_active', true),
    ]);
    const actorData = actorRes.data as { name: string } | null;
    const adminsData = adminsRes.data as { id: string }[] | null;
    const actorName = actorData?.name ?? 'Membro';
    const existingTargets = new Set(rows.map((r) => r.member_id));
    for (const admin of adminsData ?? []) {
      if (existingTargets.has(admin.id)) continue;
      rows.push({
        member_id: admin.id,
        type: 'event_created',
        title: `${actorName} criou um evento`,
        body: opts.eventTitle,
        event_id: opts.eventId,
      });
    }
  }

  if (rows.length > 0) {
    await serviceDb.from('notifications').insert(rows);
  }
}

/**
 * Envia convite .ics pra cada participante do evento (exceto o ator que criou).
 *
 * Diferença vs approve flow:
 *   - approve manda pro sócio único + cliente externo
 *   - aqui pode haver múltiplos participantes (joint meeting)
 *   - cada um recebe convite individualizado
 *
 * Tratamento de falha:
 *   - Falhas por participante são logadas mas não interrompem o resto
 *   - Promise.allSettled garante que 1 falha não cancela os outros envios
 *   - Outer try/catch evita derrubar a criação do event
 */
async function sendInvitesForCreatedEvent(
  serviceDb: ServiceDb,
  opts: {
    eventId: string;
    eventTitle: string;
    eventDescription: string | null;
    eventLocation: string | null;
    eventStartAt: Date;
    eventEndAt: Date;
    memberId: string; // host (sócio dono do calendar)
    participantIds: string[];
    actorMemberId: string;
    actorUserEmail: string | null;
  }
): Promise<void> {
  try {
    // Participantes únicos (memberId + extras), excluindo o ator
    const recipientIds = Array.from(
      new Set([opts.memberId, ...opts.participantIds])
    ).filter((id) => id !== opts.actorMemberId);
    if (recipientIds.length === 0) return;

    const { data: rawMembers } = await serviceDb
      .from('members')
      .select('id, name, user_id')
      .in('id', recipientIds);
    const recipients = (rawMembers ?? []) as Array<{
      id: string;
      name: string;
      user_id: string | null;
    }>;

    // Busca info do ator (organizer)
    const { data: rawActor } = await serviceDb
      .from('members')
      .select('name')
      .eq('id', opts.actorMemberId)
      .single();
    const actor = rawActor as { name: string } | null;
    const organizerName = actor?.name ?? 'EQR Agenda';
    const organizerEmail = opts.actorUserEmail ?? 'agenda@eqr.com.br';

    const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

    await Promise.allSettled(
      recipients
        .filter((m) => m.user_id)
        .map(async (m) => {
          try {
            const userResp = await serviceDb.auth.admin.getUserById(m.user_id!);
            const email = userResp.data.user?.email;
            if (!email) {
              console.warn('[events/create/sendInvite] no email for member', { memberId: m.id });
              return;
            }
            const invite = {
              uid: `${opts.eventId}@${host}`,
              title: opts.eventTitle,
              description: opts.eventDescription,
              location: opts.eventLocation,
              startAt: opts.eventStartAt,
              endAt: opts.eventEndAt,
              organizer: { name: organizerName, email: organizerEmail },
              attendees: [{ name: m.name, email, rsvp: true }],
              status: 'CONFIRMED' as const,
              url: `https://${host}/meetings/${opts.eventId}`,
            };
            const result = await sendMeetingInvite(serviceDb, {
              to: email,
              toName: m.name,
              invite,
            });
            if (!result.ok) {
              console.warn('[events/create/sendInvite] failed', {
                eventId: opts.eventId,
                memberId: m.id,
                error: result.error,
              });
            }
          } catch (err) {
            console.error('[events/create/sendInvite] exception per recipient', {
              memberId: m.id,
              error: err instanceof Error ? err.message : err,
            });
          }
        })
    );
  } catch (err) {
    console.error('[events/create/sendInvitesForCreatedEvent] outer error', {
      eventId: opts.eventId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; role: string } | null;

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse body before permission check (was a bug: parsed was used before being defined)
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  // Membro só pode marcar a si mesmo como host principal (memberId).
  // Pode adicionar outros membros como participantes — sem aceite necessário.
  if (member.role !== 'admin' && parsed.data.memberId !== member.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Valida que todos os participantes existem e estão ativos
  const requestedParticipantIds = Array.from(
    new Set([parsed.data.memberId, ...(parsed.data.participantIds ?? [])])
  );
  if (requestedParticipantIds.length > 1) {
    const serviceDbCheck = await getSupabaseServiceClient();
    const { data: validMembers, error: membersErr } = await serviceDbCheck
      .from('members')
      .select('id')
      .in('id', requestedParticipantIds)
      .eq('is_active', true);
    if (membersErr) {
      return NextResponse.json({ error: `Erro ao validar participantes: ${membersErr.message}` }, { status: 500 });
    }
    const validIds = new Set((validMembers as { id: string }[] | null ?? []).map((m) => m.id));
    const invalid = requestedParticipantIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Participantes inválidos ou inativos: ${invalid.join(', ')}` }, { status: 400 });
    }
  }

  const serviceDb = await getSupabaseServiceClient();
  const service = new EventService({
    db: serviceDb,
    actorId: member.id,
    actorRole: member.role,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  try {
    const { event, hasConflict } = await service.create({
      memberId: parsed.data.memberId,
      participantIds: parsed.data.participantIds,
      participantsCanEdit: parsed.data.participantsCanEdit,
      createdBy: member.id,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      allDay: parsed.data.allDay,
      status: parsed.data.status,
      reminders: parsed.data.reminders,
    });

    // Fire-and-forget: insert notifications without blocking the response
    void insertCreatedNotifications(serviceDb, {
      eventId: event.id,
      eventTitle: event.title,
      participantIds: event.participantIds,
      actorMemberId: member.id,
      actorRole: member.role,
    });

    // Email + CalDAV em paralelo — ambos awaitados pra Vercel não cortar a function
    const participantsAndHost = Array.from(new Set([event.memberId, ...event.participantIds]));
    const [, caldavResult] = await Promise.all([
      sendInvitesForCreatedEvent(serviceDb, {
        eventId: event.id,
        eventTitle: event.title,
        eventDescription: event.description,
        eventLocation: event.location,
        eventStartAt: event.startAt,
        eventEndAt: event.endAt,
        memberId: event.memberId,
        participantIds: event.participantIds,
        actorMemberId: member.id,
        actorUserEmail: user.email ?? null,
      }).catch(() => undefined),
      // Push direto pro Apple Calendar dos participantes via CalDAV (real-time)
      pushEventToCaldavConnections(serviceDb, {
        eventId: event.id,
        eventTitle: event.title,
        eventDescription: event.description,
        eventLocation: event.location,
        eventStartAt: event.startAt,
        eventEndAt: event.endAt,
        participantMemberIds: participantsAndHost,
        actorMemberId: member.id,
        organizerName: 'EQR Agenda',
        organizerEmail: user.email ?? 'agenda@eqr.com.br',
      }).catch(() => ({ attempted: false, anySuccess: false, anyFailure: false })),
    ]);

    // Microsoft Graph sync (Outlook OAuth). Hoje parqueado mas mantido — se
    // sócio voltar a conectar Outlook, marca external_event_id corretamente.
    const msResult = await syncCreateToMicrosoft(serviceDb, {
      eventId: event.id,
      memberId: event.memberId,
      data: {
        title: event.title,
        description: event.description,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        status: event.status === 'tentative' ? 'tentative' : 'confirmed',
        reminders: event.reminders,
      },
    });

    // Combina resultados pra computar sync_status final.
    // - MS sucesso: deixa como está (markSynced já gravou external_event_id).
    // - MS não rodou + CalDAV sucesso: marca 'synced' (limpa o "Sincronizando" eterno).
    // - MS não rodou + CalDAV falhou: 'failed'.
    // - Nenhum dos dois rodou (nem Outlook nem CalDAV): 'local_only' (semântica:
    //   sem destino externo configurado — não fica preso em 'pending').
    if (!msResult.succeeded) {
      const finalStatus =
        caldavResult.anySuccess ? 'synced' :
        msResult.attempted || caldavResult.attempted ? 'failed' :
        'local_only';
      // sync_error preciso por origem (evita msg stale de provider anterior):
      // - synced ou local_only: sem erro
      // - failed só MS: msg do markFailed (MS já gravou — não toca)
      // - failed só CalDAV: marca explicitamente
      // - failed ambos: marca como combinado
      let finalSyncError: string | null | undefined; // undefined = não toca
      if (finalStatus === 'synced' || finalStatus === 'local_only') {
        finalSyncError = null;
      } else if (msResult.attempted && caldavResult.attempted) {
        finalSyncError = 'Microsoft e Apple Calendar (CalDAV) ambos falharam';
      } else if (!msResult.attempted && caldavResult.attempted) {
        finalSyncError = 'Push pro Apple Calendar (CalDAV) falhou';
      }
      const update: Record<string, unknown> = {
        sync_status: finalStatus,
        last_synced_at: new Date().toISOString(),
      };
      if (finalSyncError !== undefined) update['sync_error'] = finalSyncError;
      await serviceDb.from('events').update(update).eq('id', event.id);

      // Reflete o status final no objeto retornado pro cliente. Sem isso, o
      // React adiciona o evento ao cache com sync_status='pending' (valor de
      // service.create) e o badge "Sincronizando" aparece até o próximo refetch.
      (event as { syncStatus: typeof finalStatus }).syncStatus = finalStatus;
      if (finalSyncError !== undefined) {
        (event as { syncError: string | null }).syncError = finalSyncError;
      }
    }

    return NextResponse.json({ event, hasConflict }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const startAt = searchParams.get('startAt');
  const endAt = searchParams.get('endAt');
  const memberId = searchParams.get('memberId');

  let query = supabase
    .from('events')
    .select('*, event_participants(member_id, role, can_edit)');
  if (startAt) query = query.gte('start_at', startAt);
  if (endAt) query = query.lte('end_at', endAt);
  if (memberId) {
    const { data: pRows } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('member_id', memberId);
    const ids = (pRows ?? []).map((r) => (r as { event_id: string }).event_id);
    if (ids.length === 0) return NextResponse.json({ events: [] });
    query = query.in('id', ids);
  }

  const { data, error } = await query.order('start_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data });
}
