import { CalendarRoot } from '@/components/calendar/CalendarRoot';

export const metadata = { title: 'Calendário' };

export default function CalendarPage({
  searchParams,
}: {
  searchParams: { member?: string; filter?: string };
}) {
  return <CalendarRoot initialMemberId={searchParams.member} initialFilter={searchParams.filter} />;
}
