'use client';

import { SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate, startOfWeek, addDays, addWeeks } from '@/lib/calendar/dateUtils';
import { NotificationBell } from './NotificationBell';
import { cn } from '@/lib/utils';

type CalendarView = 'day' | 'week' | 'month';

interface TopBarProps {
  currentDate: Date;
  view: CalendarView;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onOpenMobileFilters?: () => void;
  showMobileFilters?: boolean;
}

const VIEW_LABELS: Record<CalendarView, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
};

// Abbreviated labels for narrow screens
const VIEW_LABELS_SHORT: Record<CalendarView, string> = {
  day: 'Dia',
  week: 'Sem',
  month: 'Mês',
};

function getDateLabel(date: Date, view: CalendarView, withYear: boolean): string {
  if (view === 'day') {
    return withYear
      ? formatDate(date, "EEEE, d 'de' MMMM yyyy")
      : formatDate(date, "EEEE, d 'de' MMMM");
  }
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const end = addDays(start, 6);
    return withYear
      ? `${formatDate(start, 'd MMM')} – ${formatDate(end, "d MMM yyyy")}`
      : `${formatDate(start, 'd MMM')} – ${formatDate(end, 'd MMM')}`;
  }
  return withYear ? formatDate(date, 'MMMM yyyy') : formatDate(date, 'MMMM');
}

export function TopBar({
  currentDate,
  view,
  onDateChange,
  onViewChange,
  onOpenMobileFilters,
  showMobileFilters = false,
}: TopBarProps) {
  return (
    <header className="relative h-14 flex items-center px-2 sm:px-4 gap-1.5 sm:gap-4 border-b border-surface-border bg-surface-elevated/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Hairline dourado sob o cabeçalho — detalhe EQR */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Atalhos "1 sem" / "2 sem" — só desktop */}
      <div className="hidden sm:flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {[
          { label: '1 sem', date: () => addWeeks(new Date(), 1) },
          { label: '2 sem', date: () => addWeeks(new Date(), 2) },
        ].map(({ label, date: getDate }) => {
          const target = getDate();
          const isActive = getDateLabel(currentDate, view, true) === getDateLabel(target, view, true);
          return (
            <button
              key={label}
              onClick={() => onDateChange(getDate())}
              className={cn(
                'px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent/15 text-accent shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Label da data atual — off-white EQR em destaque */}
      <motion.h2
        key={getDateLabel(currentDate, view, true)}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-text-primary font-semibold text-sm sm:text-base capitalize flex-1 truncate min-w-0 tracking-tight"
      >
        <span className="sm:hidden">{getDateLabel(currentDate, view, false)}</span>
        <span className="hidden sm:inline">{getDateLabel(currentDate, view, true)}</span>
      </motion.h2>

      {/* Botão Filtros — apenas mobile */}
      {showMobileFilters && (
        <button
          type="button"
          onClick={onOpenMobileFilters}
          className="sm:hidden p-2 rounded-md hover:bg-surface-overlay transition-colors text-text-secondary hover:text-text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Abrir filtros"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      )}

      {/* Seletor de view — ativo em dourado EQR */}
      <div className="flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={cn(
              'px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 min-h-[36px]',
              view === v
                ? 'bg-accent/15 text-accent shadow-sm ring-1 ring-accent/25'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <span className="hidden sm:inline">{VIEW_LABELS[v]}</span>
            <span className="sm:hidden">{VIEW_LABELS_SHORT[v]}</span>
          </button>
        ))}
      </div>

      <NotificationBell />
    </header>
  );
}
