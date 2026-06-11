import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';
import { z } from 'zod';
import { syncUpdateToMicrosoft, syncDeleteFromMicrosoft } from '@/lib/microsoftSync';
import { pushEventToCaldavConnections } from '@/lib/caldav/pushEventToCaldav';

const reminderSchema = z.object({
  method: z.enum(['popup', 'email']),
  minutes: z.number().int().min(0).max(40320),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  participantIds: z.array(z.string().uuid()).max(20).optional(),
  participantsCanEdit: z.boolean().optional(),
  reminders: z.array(reminderSchema).max(5).optional(),
});

type ServiceDb = Awaited<ReturnType<typeof getSupabaseServiceClient>>;

async function insertDeletedNotifications(
  serviceDb: ServiceDb,
  opts: { eventTitle: string; participantIds: string[]; actorMemberId: string; actorRole: string }
) {
  const rows: Array<{
    member_id: string; type: string; title: string; body: string; event_id: null;
  }> = [];

  // Notify every participant (except the actor)
  for (const pid of opts.participantIds) {
    if (pid === opts.actorMemberId) continue;
    rows.push({
      member_id: pid,
      type: 'event_deleted',
      title: 'Evento removido',
      body: opts.eventTitle,
      event_id: null,
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
        type: 'event_deleted',
        title: `${actorName} removeu um evento`,
        body: opts.eventTitle,
        event_id: null,
      });
    }
  }

  if (rows.length > 0) {
    await serviceDb.from('notifications').insert(rows);
  }
}

async function getAuthorizedMember(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  eventId: string,
  action: 'update' | 'delete'
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; role: string } | null;

  if (!member) return null;
  if (member.role === 'admin') return member;

  const { data: rawEvent } = await supabase
    .from('events')
    .select('member_id, created_by')
    .eq('id', eventId)
    .single();
  const event = rawEvent as { member_id: string; created_by: string } | null;
  if (!event) return null;

  if (action === 'delete') {
    // Pode deletar: criador OU dono do calendário (member_id).
    // Caso comum que motivou incluir member_id: approve_meeting_request grava
    // created_by = admin que aprovou, mas o evento vive no calendar do sócio
    // (member_id = target_partner). Sem isso, o sócio dono nunca consegue
    // remover o próprio evento — só o admin remove. Admin já tem bypass acima.
    if (event.created_by === member.id || event.member_id === member.id) return member;
    return null;
  }

  // update: owner ou participant com can_edit=true (checagem em event_participants)
  const { data: rawParticipant } = await supabase
    .from('event_participants')
    .select('role, can_edit')
    .eq('event_id', eventId)
    .eq('member_id', member.id)
    .maybeSingle();
  const participant = rawParticipant as { role: string; can_edit: boolean } | null;
  if (!participant) return null;
  if (participant.role === 'owner') return member;
  if (participant.can_edit) return member;
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const member = await getAuthorizedMember(supabase, id, 'update');
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
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
    const { event, hasConflict } = await service.update({
      id,
      ...parsed.data,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
    });

    // Microsoft Graph sync (Outlook OAuth, parqueado) + CalDAV push (Apple).
    // Em paralelo: Microsoft via OAuth e CalDAV pra cada participante conectado.
    const participantsAndHost = Array.from(new Set([event.memberId, ...event.participantIds]));
    const [msResult, caldavResult] = await Promise.all([
      syncUpdateToMicrosoft(serviceDb, {
        eventId: event.id,
        memberId: event.memberId,
        externalEventId: event.externalEventId,
        data: {
          title: event.title,
          description: event.description,
          location: event.location,
          startAt: event.startAt,
          endAt: event.endAt,
          allDay: event.allDay,
          status: event.status === 'tentative' ? 'tentative' : event.status === 'cancelled' ? 'cancelled' : 'confirmed',
          reminders: event.reminders,
        },
      }),
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
        organizerEmail: 'agenda@eqr.com.br',
      }).catch(() => ({ attempted: false, anySuccess: false, anyFailure: false })),
    ]);

    // Mesma lógica combinada do POST: se MS não marcou synced, combinar resultados.
    if (!msResult.succeeded) {
      const finalStatus =
        caldavResult.anySuccess ? 'synced' :
        msResult.attempted || caldavResult.attempted ? 'failed' :
        'local_only';
      let finalSyncError: string | null | undefined;
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

      // Reflete o status final no payload retornado pro cliente (mesma razão
      // do POST: React Query usa esse objeto pra atualizar o cache).
      (event as { syncStatus: typeof finalStatus }).syncStatus = finalStatus;
      if (finalSyncError !== undefined) {
        (event as { syncError: string | null }).syncError = finalSyncError;
      }
    }

    return NextResponse.json({ event, hasConflict });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error';
    if (message === 'EVENT_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Este evento não existe mais (pode ter sido removido). Recarregue a página.', code: 'EVENT_NOT_FOUND' },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const member = await getAuthorizedMember(supabase, id, 'delete');
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch event details + participants before deletion (needed for notification + Calendar sync)
  const { data: rawEventSnapshot } = await supabase
    .from('events')
    .select('title, member_id, external_event_id, external_provider, event_participants(member_id)')
    .eq('id', id)
    .single();
  const eventSnapshot = rawEventSnapshot as {
    title: string;
    member_id: string;
    external_event_id: string | null;
    external_provider: 'google' | 'microsoft' | null;
    event_participants: { member_id: string }[];
  } | null;

  const serviceDb = await getSupabaseServiceClient();
  const service = new EventService({
    db: serviceDb,
    actorId: member.id,
    actorRole: member.role,
  });

  try {
    await service.delete(id);

    // Fire-and-forget: insert notifications after successful deletion
    if (eventSnapshot) {
      const partIds = (eventSnapshot.event_participants ?? []).map((p) => p.member_id);
      void insertDeletedNotifications(serviceDb, {
        eventTitle: eventSnapshot.title,
        participantIds: partIds.length > 0 ? partIds : [eventSnapshot.member_id],
        actorMemberId: member.id,
        actorRole: member.role,
      }).catch((err) => {
        console.error('[events/delete] insertDeletedNotifications failed', {
          eventId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await syncDeleteFromMicrosoft(serviceDb, {
        memberId: eventSnapshot.member_id,
        externalEventId: eventSnapshot.external_event_id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
