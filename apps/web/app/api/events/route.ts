import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';
import { z } from 'zod';

const createSchema = z.object({
  memberId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
});

type ServiceDb = Awaited<ReturnType<typeof getSupabaseServiceClient>>;

async function insertCreatedNotifications(
  serviceDb: ServiceDb,
  opts: { eventId: string; eventTitle: string; targetMemberId: string; actorMemberId: string; actorRole: string }
) {
  const rows: Array<{
    member_id: string; type: string; title: string; body: string; event_id: string | null;
  }> = [];

  // Always notify the event owner
  rows.push({
    member_id: opts.targetMemberId,
    type: 'event_created',
    title: 'Evento criado',
    body: opts.eventTitle,
    event_id: opts.eventId,
  });

  // If actor is a regular member, also notify all admins
  if (opts.actorRole !== 'admin') {
    const [actorRes, adminsRes] = await Promise.all([
      serviceDb.from('members').select('name').eq('id', opts.actorMemberId).single(),
      serviceDb.from('members').select('id').eq('role', 'admin').eq('is_active', true),
    ]);
    const actorData = actorRes.data as { name: string } | null;
    const adminsData = adminsRes.data as { id: string }[] | null;
    const actorName = actorData?.name ?? 'Membro';
    for (const admin of adminsData ?? []) {
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

  // Membro só pode criar eventos para si mesmo
  if (member.role !== 'admin' && parsed.data.memberId !== member.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      createdBy: member.id,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      allDay: parsed.data.allDay,
      status: parsed.data.status,
    });

    // Fire-and-forget: insert notifications without blocking the response
    void insertCreatedNotifications(serviceDb, {
      eventId: event.id,
      eventTitle: event.title,
      targetMemberId: parsed.data.memberId,
      actorMemberId: member.id,
      actorRole: member.role,
    });

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

  let query = supabase.from('events').select('*');
  if (startAt) query = query.gte('start_at', startAt);
  if (endAt) query = query.lte('end_at', endAt);
  if (memberId) query = query.eq('member_id', memberId);

  const { data, error } = await query.order('start_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data });
}
