import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { generateIcs, type IcsEvent } from '@/lib/calendar/generateIcs';
import type { Database } from '@eqr/database';

/**
 * GET /api/calendar/[token].ics
 *
 * Endpoint PÚBLICO (sem auth) consumido por Google Calendar / Apple Calendar /
 * Outlook como subscription URL. Resolve o token pra um member e retorna VCALENDAR
 * com os eventos dele numa janela temporal padrão.
 *
 * O token funciona como segredo da URL — quem tem o link vê os eventos do member.
 * Sócio pode revogar regenerando o token via /api/calendar/share.
 *
 * Notas:
 * - Aceita também URL sem .ics (Next.js casa /[token] e /[token].ics no mesmo handler
 *   porque .ics não é route segment; o param vira "abc123.ics" e a gente tira o sufixo)
 * - Janela: passado 30 dias + futuro 365 dias (boa pra Google/Apple polling)
 * - Eventos com visibility='private': título substituído por "[Privado]",
 *   description/location omitidos. Calendar app mostra como "Ocupado [Privado]".
 * - Cache: 5min via Cache-Control (calendar apps já pollam em janela maior)
 */

type EventRow = Database['public']['Tables']['events']['Row'];
type EventFields = Pick<EventRow,
  'id' | 'title' | 'description' | 'location' | 'start_at' | 'end_at' |
  'all_day' | 'status' | 'visibility' | 'created_at' | 'updated_at'
>;

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 365;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  // Tira sufixo .ics se vier
  const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;

  // Token deve parecer com base64url de 32 bytes (43 chars). Validação básica
  // pra evitar query desnecessária com lixo.
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const supabase = await getSupabaseServiceClient();

  // Resolve member pelo token
  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, calendar_share_token')
    .eq('calendar_share_token', token)
    .single();

  if (memberErr || !rawMember) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const member = rawMember as { id: string; name: string; calendar_share_token: string };

  // Janela temporal
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_PAST_DAYS);
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_FUTURE_DAYS);

  const { data: rawEvents, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, description, location, start_at, end_at, all_day, status, visibility, created_at, updated_at')
    .eq('member_id', member.id)
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .order('start_at', { ascending: true });

  if (eventsErr) {
    console.error('[api/calendar/[token]] events query failed', { memberId: member.id, error: eventsErr.message });
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const events = (rawEvents ?? []) as EventFields[];

  // Host pra UID estável (mesmo evento sempre tem o mesmo UID — calendar apps usam pra dedup)
  const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

  const icsEvents: IcsEvent[] = events.map((ev) => {
    const isPrivate = ev.visibility === 'private';
    return {
      uid: `${ev.id}@${host}`,
      title: isPrivate ? '[Privado]' : ev.title,
      description: isPrivate ? null : ev.description,
      location: isPrivate ? null : ev.location,
      startAt: ev.start_at,
      endAt: ev.end_at,
      allDay: ev.all_day,
      status: ev.status as 'confirmed' | 'tentative' | 'cancelled',
      visibility: ev.visibility as 'public' | 'private',
      createdAt: ev.created_at,
      updatedAt: ev.updated_at,
    };
  });

  const ics = generateIcs({
    calendarName: `EQR Agenda — ${member.name}`,
    calendarDescription: `Agenda de ${member.name} sincronizada da EQR Agenda Master`,
    events: icsEvents,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${member.id}.ics"`,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
