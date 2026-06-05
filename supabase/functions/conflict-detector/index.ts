import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ConflictRequest {
  memberId: string;
  eventId: string;
  startAt: string;
  endAt: string;
}

interface OverlapEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: ConflictRequest;
  try {
    body = await req.json() as ConflictRequest;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Consulta de overlap usando o índice GiST tstzrange
  const { data: overlapping, error } = await supabase
    .from('events')
    .select('id, title, start_at, end_at')
    .eq('member_id', body.memberId)
    .neq('id', body.eventId)
    .neq('status', 'cancelled')
    .lt('start_at', body.endAt)
    .gt('end_at', body.startAt);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const conflicts = (overlapping ?? []) as OverlapEvent[];

  if (conflicts.length > 0) {
    // Upsert de conflitos
    const inserts = conflicts.map((other) => {
      const overlapStart = new Date(Math.max(
        new Date(body.startAt).getTime(),
        new Date(other.start_at).getTime()
      ));
      const overlapEnd = new Date(Math.min(
        new Date(body.endAt).getTime(),
        new Date(other.end_at).getTime()
      ));

      const [idA, idB] = [body.eventId, other.id].sort();

      return {
        member_id: body.memberId,
        event_id_a: idA,
        event_id_b: idB,
        overlap_start: overlapStart.toISOString(),
        overlap_end: overlapEnd.toISOString(),
        resolved: false,
      };
    });

    await supabase.from('conflicts').upsert(inserts, {
      onConflict: 'event_id_a,event_id_b',
      ignoreDuplicates: false,
    });
  }

  return new Response(
    JSON.stringify({
      hasConflict: conflicts.length > 0,
      conflictCount: conflicts.length,
      overlapping: conflicts.map((c) => ({
        id: c.id,
        title: c.title,
        startAt: c.start_at,
        endAt: c.end_at,
      })),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
