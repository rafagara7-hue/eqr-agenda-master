import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewMeetingClient } from '@/components/meetings/NewMeetingClient';
import type { Database } from '@eqr/database';

export const metadata = { title: 'Nova solicitação' };

type MemberRow = Database['public']['Tables']['members']['Row'];
type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

export default async function StaffNewMeetingPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember, error: memberErr } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr) console.error('[staff/nova-reuniao] member lookup failed', memberErr);

  const member = rawMember as MemberFields | null;
  if (!member) redirect('/login');
  if (member.role !== 'employee') redirect('/calendar');

  const { data: partners, error: partnersErr } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .in('role', ['member', 'admin'])
    .eq('is_active', true)
    .order('name');
  if (partnersErr) console.error('[staff/nova-reuniao] partners query failed', partnersErr);

  return (
    <NewMeetingClient
      member={{ id: member.id, name: member.name }}
      partners={(partners ?? []) as MemberFields[]}
      backHref="/staff"
      onSuccessHref="/staff"
    />
  );
}
