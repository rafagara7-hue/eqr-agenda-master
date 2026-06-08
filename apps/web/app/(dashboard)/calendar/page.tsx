import { CalendarRoot } from '@/components/calendar/CalendarRoot';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { triggerLazyResyncForAll } from '@/lib/lazyIcalSync';

export const metadata = { title: 'Calendário' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { member?: string; filter?: string };
}) {
  // Lazy sync: dispara fetch+upsert em background pra TODOS members com
  // calendar externo stale. Não bloqueia render — quando user dá refresh,
  // dados frescos aparecem.
  //
  // Só roda pra users autenticados (middleware já garante). Throttle 5min
  // por row no helper.
  try {
    const auth = await getSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (user) {
      const serviceDb = await getSupabaseServiceClient();
      void triggerLazyResyncForAll(serviceDb);
    }
  } catch {
    // Falha de sync nunca quebra render do calendar
  }

  return <CalendarRoot initialMemberId={searchParams.member} initialFilter={searchParams.filter} />;
}
