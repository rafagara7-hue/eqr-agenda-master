import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const memberId = searchParams.get('memberId');
  const startAt = searchParams.get('startAt');
  const endAt = searchParams.get('endAt');
  const excludeId = searchParams.get('excludeId');

  if (!memberId || !startAt || !endAt) {
    return NextResponse.json({ error: 'memberId, startAt, endAt are required' }, { status: 400 });
  }

  let query = supabase
    .from('events')
    .select('id, title, start_at, end_at')
    .eq('member_id', memberId)
    .neq('status', 'cancelled')
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conflicts = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
  }));

  return NextResponse.json({ conflicts });
}
