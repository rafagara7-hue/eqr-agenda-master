import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { MeetingRequestRepository } from '@eqr/database';
import { sendMeetingInvite } from '@/lib/email/sendMeetingInvite';

const bodySchema = z.object({
  decisionNote: z.string().max(2000).optional(),
});

/**
 * Após approve, envia convite .ics via email pro sócio (e externo se houver email).
 * Roda fire-and-forget mas com `await` pra Vercel não matar a function — falha
 * não derruba o approve em si.
 */
async function sendInviteAfterApprove(
  serviceDb: Awaited<ReturnType<typeof getSupabaseServiceClient>>,
  eventId: string,
  requestId: string,
  reviewerMemberId: string
): Promise<void> {
  try {
    // Busca o evento criado pelo approve
    const { data: rawEvent } = await serviceDb
      .from('events')
      .select('id, title, description, location, start_at, end_at, member_id, created_by')
      .eq('id', eventId)
      .single();
    const event = rawEvent as {
      id: string; title: string; description: string | null; location: string | null;
      start_at: string; end_at: string; member_id: string; created_by: string;
    } | null;
    if (!event) return;

    // Busca o request (pra ter external contact)
    const { data: rawReq } = await serviceDb
      .from('meeting_requests')
      .select('metadata')
      .eq('id', requestId)
      .single();
    const reqMeta = (rawReq as { metadata: Record<string, unknown> | null } | null)?.metadata ?? null;
    const external = reqMeta?.['external'] as { name?: string; phone?: string; email?: string } | undefined;

    // Busca sócio (target_partner — dono do calendar)
    const { data: rawMember } = await serviceDb
      .from('members')
      .select('id, name, user_id')
      .eq('id', event.member_id)
      .single();
    const partner = rawMember as { id: string; name: string; user_id: string | null } | null;
    if (!partner || !partner.user_id) return;

    // Email do sócio via auth.users
    const { data: userResp } = await serviceDb.auth.admin.getUserById(partner.user_id);
    const partnerEmail = userResp?.user?.email ?? null;

    // Quem aprovou (organizador do email)
    const { data: rawReviewer } = await serviceDb
      .from('members')
      .select('name, user_id')
      .eq('id', reviewerMemberId)
      .single();
    const reviewer = rawReviewer as { name: string; user_id: string | null } | null;
    let reviewerEmail = 'agenda@eqr.com.br';
    if (reviewer?.user_id) {
      const { data: revUser } = await serviceDb.auth.admin.getUserById(reviewer.user_id);
      reviewerEmail = revUser?.user?.email ?? reviewerEmail;
    }

    const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

    const invite = {
      uid: `${event.id}@${host}`,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: new Date(event.start_at),
      endAt: new Date(event.end_at),
      organizer: { name: reviewer?.name ?? 'EQR Agenda', email: reviewerEmail },
      attendees: [
        { name: partner.name, email: partnerEmail ?? '', rsvp: true },
        ...(external?.email ? [{ name: external.name, email: external.email, rsvp: true }] : []),
      ].filter((a) => a.email),
      status: 'CONFIRMED' as const,
      url: `https://${host}/meetings/${event.id}`,
    };

    // Envia pro sócio
    if (partnerEmail) {
      const r = await sendMeetingInvite({
        to: partnerEmail,
        toName: partner.name,
        invite,
      });
      if (!r.ok) {
        console.warn('[approve/sendInvite] partner email failed', { eventId, error: r.error });
      }
    }

    // Envia pro externo se houver email no metadata (form /agendar atualmente só
    // captura name+phone — adicionar email é enhancement futuro)
    if (external?.email) {
      const r = await sendMeetingInvite({
        to: external.email,
        toName: external.name,
        invite,
      });
      if (!r.ok) {
        console.warn('[approve/sendInvite] external email failed', { eventId, error: r.error });
      }
    }
  } catch (err) {
    console.error('[approve/sendInvite] exception (não-fatal)', {
      eventId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase.from('members').select('id, role').eq('user_id', user.id).single();
  const member = rawMember as { id: string; role: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Usa service client porque a function approve_meeting_request faz inserts em events
  // (que tem RLS admin-only pra INSERT). A function eh SECURITY DEFINER mas precisa do bypass.
  const serviceDb = await getSupabaseServiceClient();
  const repo = new MeetingRequestRepository(serviceDb);

  try {
    const eventId = await repo.approve({
      requestId: id,
      reviewerId: member.id,
      decisionNote: parsed.data.decisionNote,
    });

    // Envia convite por email — não derruba o approve se falhar
    await sendInviteAfterApprove(serviceDb, eventId, id, member.id);

    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro ao aprovar';
    console.error('[api/meetings/approve] failed', { requestId: id, reviewerId: member.id, error: raw });
    const lower = raw.toLowerCase();
    let userMsg = 'Erro ao aprovar a solicitação';
    let status = 400;
    if (lower.includes('forbidden') || lower.includes('not authorized')) {
      userMsg = 'Sem permissão para aprovar esta solicitação';
      status = 403;
    } else if (lower.includes('not found') || lower.includes('does not exist')) {
      userMsg = 'Solicitação não encontrada';
      status = 404;
    } else if (lower.includes('already')) {
      userMsg = 'Solicitação já foi decidida';
      status = 409;
    } else if (lower.includes('conflict')) {
      userMsg = 'Conflito de horário detectado';
      status = 409;
    }
    return NextResponse.json({ error: userMsg }, { status });
  }
}
