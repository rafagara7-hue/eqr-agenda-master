import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StaffHomeClient } from '@/components/staff/StaffHomeClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Minhas reuniões' };

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];

type RequestFields = Pick<RequestRow,
  'id' | 'title' | 'target_partner_id' | 'proposed_start' | 'proposed_end' |
  'status' | 'priority' | 'created_at' | 'reviewed_at' | 'decision_reason'
>;
type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

export default async function StaffHomePage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr) console.error('[staff] member lookup failed', memberErr);

  const member = rawMember as MemberFields | null;
  if (!member) redirect('/login');

  // Defesa: gate de role no server (middleware ja gateou tambem)
  if (member.role !== 'employee') redirect('/calendar');

  const [reqRes, partnersRes] = await Promise.all([
    supabase
      .from('meeting_requests')
      .select('id, title, target_partner_id, proposed_start, proposed_end, status, priority, created_at, reviewed_at, decision_reason')
      .eq('requester_id', member.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('members')
      .select('id, name, slug, color_hex, avatar_url, role')
      .in('role', ['member', 'admin'])
      .eq('is_active', true)
      .order('name'),
  ]);

  if (reqRes.error) console.error('[staff] requests query failed', reqRes.error);
  if (partnersRes.error) console.error('[staff] partners query failed', partnersRes.error);

  return (
    <StaffHomeClient
      member={member}
      requests={(reqRes.data ?? []) as RequestFields[]}
      partners={(partnersRes.data ?? []) as MemberFields[]}
      hasLoadError={!!(reqRes.error || partnersRes.error)}
    />
  );
}
