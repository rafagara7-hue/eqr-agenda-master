import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { EventService } from '@eqr/services';
import { z } from 'zod';
import { syncCreateToGoogle } from '@/lib/googleSync';

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
    });

    // Fire-and-forget: insert notifications without blocking the response
    void insertCreatedNotifications(serviceDb, {
      eventId: event.id,
      eventTitle: event.title,
      participantIds: event.participantIds,
      actorMemberId: member.id,
      actorRole: member.role,
    });

    // Awaitamos o sync com o Google: em serverless da Vercel, fire-and-forget
    // (void) é cortado quando o handler retorna. Esperar 1-2s garante que o
    // sync_status seja gravado (synced ou failed). Falhas internamente são
    // tratadas por syncCreateToGoogle e nunca propagam — segura pra await.
    await syncCreateToGoogle(serviceDb, {
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
      },
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
