import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PublicBookingForm } from '@/components/public/PublicBookingForm';

export const metadata = {
  title: 'Solicitar reunião — EQR',
  description: 'Solicite uma reunião com um sócio EQR Holding.',
};

interface PartnerFields {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
}

export default async function AgendarPage() {
  // Rota PUBLICA. members RLS bloqueia SELECT pra anon, entao usa
  // public_list_partners() SECURITY DEFINER (migration 0021).
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('public_list_partners');
  if (error) console.error('[agendar] public_list_partners failed', error);

  return <PublicBookingForm partners={(data ?? []) as PartnerFields[]} />;
}
