import { CalendarRoot } from '@/components/calendar/CalendarRoot';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { triggerLazyResyncForAll } from '@/lib/lazyIcalSync';
import { triggerLazyReverseSyncForAll } from '@/lib/caldav/lazyReverseCaldavSync';

export const metadata = { title: 'Calendário' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { member?: string; filter?: string };
}) {
  // Lazy syncs: disparam fetch em background.
  //   1. iCal subscriptions (Outlook/Google/Apple iCal feed) — pull eventos externos
  //   2. CalDAV reverse-sync — detect+delete de events removidos no Apple Calendar
  // Nenhum bloqueia o render — quando user dá refresh, dados frescos aparecem.
  // Throttles independentes (5min cada).
  try {
    const auth = await getSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (user) {
      const serviceDb = await getSupabaseServiceClient();
      void triggerLazyResyncForAll(serviceDb);
      void triggerLazyReverseSyncForAll(serviceDb);
    }
  } catch {
    // Falha de sync nunca quebra render do calendar
  }

  return <CalendarRoot initialMemberId={searchParams.member} initialFilter={searchParams.filter} />;
}
