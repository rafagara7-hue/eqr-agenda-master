import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { MemberProfileClient } from '@/components/admin/MemberProfileClient';
import { triggerLazyResyncForMember } from '@/lib/lazyIcalSync';

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
    phone: string | null; created_at: string;
  } | null;

  if (!member) notFound();

  // Detecta se já existe row iCal external pro member + last_synced_at pra UI
  // mostrar "Atualizado X min atrás".
  const { data: rawExternal } = await supabase
    .from('calendar_provider_accounts')
    .select('id, last_synced_at')
    .eq('member_id', member.id)
    .eq('provider', 'microsoft')
    .not('ical_url', 'is', null)
    .limit(1)
    .maybeSingle();
  const externalRow = rawExternal as { id: string; last_synced_at: string | null } | null;
  const hasExternalCalendar = !!externalRow;
  const lastSyncedAt = externalRow?.last_synced_at ?? null;

  // Apple Calendar (CalDAV) status: verified_at IS NOT NULL = conectado.
  const { data: rawCaldav } = await supabase
    .from('caldav_connections')
    .select('verified_at, last_sync_at')
    .eq('member_id', member.id)
    .maybeSingle();
  const caldavRow = rawCaldav as { verified_at: string | null; last_sync_at: string | null } | null;
  const caldavConnected = !!caldavRow?.verified_at;
  const caldavLastSyncAt = caldavRow?.last_sync_at ?? null;

  // Lazy sync: dispara fetch+upsert em background se feed externo está stale.
  // Não bloqueia render — próximo refresh (ou revalidação Next.js) mostra dados
  // atualizados. Usa service client porque syncIcalToEvents precisa bypassar
  // RLS em events/calendar_provider_accounts.
  if (hasExternalCalendar) {
    const serviceDb = await getSupabaseServiceClient();
    void triggerLazyResyncForMember(serviceDb, member.id);
  }

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
        phone: member.phone,
        created_at: member.created_at,
      }}
      isOwnProfile={currentMember.id === params.id}
      isAdmin={currentMember.role === 'admin'}
      hasExternalCalendar={hasExternalCalendar}
      lastSyncedAt={lastSyncedAt}
      caldavConnected={caldavConnected}
      caldavLastSyncAt={caldavLastSyncAt}
    />
  );
}
