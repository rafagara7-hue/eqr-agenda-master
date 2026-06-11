/**
 * GET /api/public/events/[id]/ics
 *
 * Endpoint PÚBLICO que serve o .ics do evento como download.
 *
 * Quem usa: links "Sim, adicionar à minha agenda" no corpo dos emails de convite.
 * Quando o sócio clica no botão Sim, o browser abre essa URL, recebe o .ics
 * com Content-Disposition: attachment, e o OS abre no calendar app default
 * pra adicionar.
 *
 * Segurança:
 *   - Endpoint público (sem auth) — necessário pra funcionar a partir de clicks
 *     em emails (sócio não tá logado quando clica)
 *   - Só serve eventos existentes — 404 se não encontrar
 *   - Não vaza dados sensíveis: só title, datas, organizer, location (mesmas
 *     infos que já estão no email)
 *   - Não permite enumeração: UUID v4 do event id é unguessable
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { generateMeetingIcs } from '@/lib/email/generateMeetingIcs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Invalid event id', { status: 400 });
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawEvent } = await serviceDb
    .from('events')
    .select('id, title, description, location, start_at, end_at, member_id, created_by')
    .eq('id', id)
    .single();
  const event = rawEvent as {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string;
    member_id: string;
    created_by: string;
  } | null;

  if (!event) {
    return new NextResponse('Event not found', { status: 404 });
  }

  // Busca nome do criador pra organizer
  const { data: rawCreator } = await serviceDb
    .from('members')
    .select('id, name, user_id')
    .eq('id', event.created_by)
    .single();
  const creator = rawCreator as { id: string; name: string; user_id: string | null } | null;

  let creatorEmail = 'agenda@eqr.com.br';
  if (creator?.user_id) {
    const userResp = await serviceDb.auth.admin.getUserById(creator.user_id);
    creatorEmail = userResp.data.user?.email ?? creatorEmail;
  }

  // Busca nome do member (host)
  const { data: rawMember } = await serviceDb
    .from('members')
    .select('id, name, user_id')
    .eq('id', event.member_id)
    .single();
  const member = rawMember as { id: string; name: string; user_id: string | null } | null;

  let memberEmail = '';
  if (member?.user_id) {
    const memberUser = await serviceDb.auth.admin.getUserById(member.user_id);
    memberEmail = memberUser.data.user?.email ?? '';
  }

  const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

  const ics = generateMeetingIcs({
    uid: `${event.id}@${host}`,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: new Date(event.start_at),
    endAt: new Date(event.end_at),
    organizer: {
      name: creator?.name ?? 'EQR Agenda',
      email: creatorEmail,
    },
    attendees: memberEmail
      ? [{ name: member?.name, email: memberEmail, rsvp: true }]
      : [],
    status: 'CONFIRMED',
    url: `https://${host}/meetings/${event.id}`,
  });

  // Sanitize filename
  const safeTitle = event.title.replace(/[^a-z0-9-_.]/gi, '_').slice(0, 50) || 'reuniao';
  const filename = `${safeTitle}.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; method=REQUEST; charset=UTF-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
