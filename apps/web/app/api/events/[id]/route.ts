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
});

type ServiceDb = Awaited<ReturnType<typeof getSupabaseServiceClient>>;

async function insertDeletedNotifications(
  serviceDb: ServiceDb,
  opts: { eventTitle: string; targetMemberId: string; actorMemberId: string; actorRole: string }
) {
  const rows: Array<{
    member_id: string; type: string; title: string; body: string; event_id: null;
  }> = [];

  // Notify the event owner (event_id is null because the event no longer exists)
  rows.push({
    member_id: opts.targetMemberId,
    type: 'event_deleted',
    title: 'Evento removido',
    body: opts.eventTitle,
    event_id: null,
  });

  // If actor is a regular member, also notify all admins
  if (opts.actorRole !== 'admin') {
    const [actorRes, adminsRes] = await Promise.all([
      serviceDb.from('members').select('name').eq('id', opts.actorMemberId).single(),
      serviceDb.from('members').select('id').eq('role', 'admin').eq('is_active', true),
    ]);
    const actorName = actorRes.data?.name ?? 'Membro';
    for (const admin of adminsRes.data ?? []) {
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
  eventId: string
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

  // Membro só pode agir sobre seus próprios eventos
  const { data: event } = await supabase
    .from('events')
    .select('member_id')
    .eq('id', eventId)
    .single();

  if (!event || event.member_id !== member.id) return null;
  return member;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const member = await getAuthorizedMember(supabase, id);
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
  const member = await getAuthorizedMember(supabase, id);
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch event details before deletion (needed for notification after delete)
  const { data: eventSnapshot } = await supabase
    .from('events')
    .select('title, member_id')
    .eq('id', id)
    .single();

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
      void insertDeletedNotifications(serviceDb, {
        eventTitle: eventSnapshot.title,
        targetMemberId: eventSnapshot.member_id,
        actorMemberId: member.id,
        actorRole: member.role,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
