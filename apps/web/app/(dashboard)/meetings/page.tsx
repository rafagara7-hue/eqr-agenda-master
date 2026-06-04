import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MeetingsListClient } from '@/components/meetings/MeetingsListClient';

export const metadata = { title: 'Reuniões' };

export default async function MeetingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawMember } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url, role')
    .eq('user_id', user.id)
    .single();
  const member = rawMember as {
    id: string; name: string; slug: string; color_hex: string;
    avatar_url: string | null; role: 'admin' | 'member' | 'employee';
  } | null;
  if (!member) redirect('/login');

  // Admin vai pra dashboard especifico
  if (member.role === 'admin') redirect('/admin/meetings');
  // Socio vai pra dashboard especifico
  if (member.role === 'member') redirect('/partner/meetings');

  // Funcionario: listar proprias solicitacoes
  const { data: requests } = await supabase
    .from('meeting_requests')
    .select('id, title, target_partner_id, proposed_start, proposed_end, status, priority, created_at, reviewed_at, decision_reason')
    .eq('requester_id', member.id)
    .order('created_at', { ascending: false });

  const { data: partners } = await supabase
    .from('members')
    .select('id, name, slug, color_hex, avatar_url')
    .in('role', ['member', 'admin'])
    .eq('is_active', true)
    .order('name');

  return (
    <MeetingsListClient
      member={member}
      requests={requests ?? []}
      partners={partners ?? []}
    />
  );
}
