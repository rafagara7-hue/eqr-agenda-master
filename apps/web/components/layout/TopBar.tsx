'use client';

import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDate, navigateDate, startOfWeek, addDays, addWeeks } from '@/lib/calendar/dateUtils';
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

function getDateLabel(date: Date, view: CalendarView): string {
  if (view === 'day') return formatDate(date, "EEEE, d 'de' MMMM yyyy");
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const end = addDays(start, 6);
    return `${formatDate(start, 'd MMM')} – ${formatDate(end, "d MMM yyyy")}`;
  }
  return formatDate(date, 'MMMM yyyy');
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
    <header className="h-14 flex items-center px-2 sm:px-4 gap-1.5 sm:gap-4 border-b border-surface-border bg-surface-elevated/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Navegação de data */}
      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <button
          onClick={() => onDateChange(navigateDate(currentDate, 'prev', view))}
          className="p-2 rounded-md hover:bg-surface-overlay transition-colors text-text-secondary hover:text-text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Atalhos "1 sem" / "2 sem" — só desktop (mobile reserva espaço pra título) */}
        <div className="hidden sm:flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5">
          {[
            { label: '1 sem', date: () => addWeeks(new Date(), 1) },
            { label: '2 sem', date: () => addWeeks(new Date(), 2) },
          ].map(({ label, date: getDate }) => {
            const target = getDate();
            const isActive = getDateLabel(currentDate, view) === getDateLabel(target, view);
            return (
              <button
                key={label}
                onClick={() => onDateChange(getDate())}
                className={cn(
                  'px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                  isActive
                    ? 'bg-surface-base text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onDateChange(navigateDate(currentDate, 'next', view))}
          className="p-2 rounded-md hover:bg-surface-overlay transition-colors text-text-secondary hover:text-text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Próximo"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Label da data atual */}
      <motion.h2
        key={getDateLabel(currentDate, view)}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-text-primary font-medium text-xs sm:text-sm capitalize flex-1 truncate min-w-0"
      >
        {getDateLabel(currentDate, view)}
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

      {/* Seletor de view */}
      <div className="flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={cn(
              'px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 min-h-[36px]',
              view === v
                ? 'bg-surface-base text-text-primary shadow-sm'
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
