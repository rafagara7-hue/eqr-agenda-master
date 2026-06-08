import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { MemberProfileClient } from '@/components/admin/MemberProfileClient';

export const metadata = { title: 'Perfil do membro' };

export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawCurrentMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const currentMember = rawCurrentMember as { id: string; role: string } | null;

  if (!currentMember) redirect('/login');

  // Não-admin só pode ver o próprio perfil
  if (currentMember.role !== 'admin' && currentMember.id !== params.id) {
    redirect(`/admin/members/${currentMember.id}`);
  }

  const { data: rawMember } = await supabase
    .from('members')
    .select('*')
    .eq('id', params.id)
    .single();
  const member = rawMember as {
    id: string; name: string; slug: string; color_hex: string;
    avatar_url: string | null; role: string; calendar_linked: boolean;
    calendar_share_token: string | null;
    phone: string | null; created_at: string;
  } | null;

  if (!member) notFound();

  return (
    <MemberProfileClient
      member={{
        id: member.id,
        name: member.name,
        slug: member.slug,
        color_hex: member.color_hex,
        avatar_url: member.avatar_url,
        role: member.role,
        calendar_linked: member.calendar_linked,
        calendar_share_token: member.calendar_share_token,
        phone: member.phone,
        created_at: member.created_at,
      }}
      isOwnProfile={currentMember.id === params.id}
      isAdmin={currentMember.role === 'admin'}
    />
  );
}
