import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { syncCreateToGoogle, syncUpdateToGoogle } from '@/lib/googleSync';

/**
 * Força o re-sync de um evento específico para o Google Calendar do owner.
 * Útil pra retentar eventos que ficaram sync_status='pending'/'failed'.
 * Apenas owner do evento OU admin pode disparar.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as { id: string; role: string } | null;
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawEvent } = await serviceDb
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  const event = rawEvent as {
    id: string;
    member_id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string;
    all_day: boolean;
    status: 'confirmed' | 'tentative' | 'cancelled';
    google_event_id: string | null;
    sync_status: string;
  } | null;

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Permissão: admin ou owner
  if (member.role !== 'admin' && member.id !== event.member_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = {
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: new Date(event.start_at),
    endAt: new Date(event.end_at),
    allDay: event.all_day,
    status: event.status,
  } as const;

  if (event.google_event_id) {
    await syncUpdateToGoogle(serviceDb, {
      eventId: event.id,
      memberId: event.member_id,
      googleEventId: event.google_event_id,
      data,
    });
  } else {
    await syncCreateToGoogle(serviceDb, {
      eventId: event.id,
      memberId: event.member_id,
      data,
    });
  }

  // Lê o estado atualizado
  const { data: rawAfter } = await serviceDb
    .from('events')
    .select('sync_status, sync_error, google_event_id')
    .eq('id', event.id)
    .single();

  return NextResponse.json({ event: rawAfter });
}
