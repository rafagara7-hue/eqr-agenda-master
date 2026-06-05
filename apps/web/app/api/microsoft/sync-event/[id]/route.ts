import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { syncCreateToMicrosoft, syncUpdateToMicrosoft } from '@/lib/microsoftSync';

/**
 * Força o re-sync de um evento específico para o Outlook Calendar do owner.
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
    external_event_id: string | null;
    external_provider: string | null;
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

  // Só re-syncar se for Microsoft (ou ainda sem provider)
  const externalEventId =
    event.external_provider === 'microsoft' || event.external_provider === null
      ? event.external_event_id
      : null;

  if (externalEventId) {
    await syncUpdateToMicrosoft(serviceDb, {
      eventId: event.id,
      memberId: event.member_id,
      externalEventId,
      data,
    });
  } else {
    await syncCreateToMicrosoft(serviceDb, {
      eventId: event.id,
      memberId: event.member_id,
      data,
    });
  }

  const { data: rawAfter } = await serviceDb
    .from('events')
    .select('sync_status, sync_error, external_event_id, external_provider')
    .eq('id', event.id)
    .single();

  return NextResponse.json({ event: rawAfter });
}
