import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { FeedbackPanel } from '@/components/feedback/FeedbackPanel';

export const metadata = { title: 'Feedback' };

export default async function FeedbackPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('members')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  const me = data as { id: string; role: string } | null;
  if (!me) redirect('/login');

  return <FeedbackPanel isAdmin={me.role === 'admin'} myMemberId={me.id} />;
}
