import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';
import { z } from 'zod';

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
    // Apenas o criador (ou admin) pode deletar
    return event.created_by === member.id ? member : null;
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
    return NextResponse.json({ event, hasConflict });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const member = await getAuthorizedMember(supabase, id, 'delete');
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch event details + participants before deletion (needed for notification after delete)
  const { data: rawEventSnapshot } = await supabase
    .from('events')
    .select('title, member_id, event_participants(member_id)')
    .eq('id', id)
    .single();
  const eventSnapshot = rawEventSnapshot as {
    title: string;
    member_id: string;
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
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
