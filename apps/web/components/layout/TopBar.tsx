'use client';

import { useState } from 'react';
import { SlidersHorizontal, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate, startOfWeek, addDays, addWeeks } from '@/lib/calendar/dateUtils';
import { NotificationBell } from './NotificationBell';
import { useAgendaSettings } from '@/hooks/useAgendaSettings';
import { useTranslation } from '@/lib/i18n';
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

// Os labels vêm do dicionário i18n via useTranslation()

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
  const { settings } = useAgendaSettings();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Refresh agora também dispara sync CalDAV (bypassa throttle 60s do lazy).
  // User vê eventos novos do Apple Calendar imediatamente sem precisar esperar.
  // Importação dinâmica do toast pra evitar bundle bloat se sonner não usado.
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/calendar/caldav-sync-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as {
          pull?: { inserted?: number; updated?: number; deleted?: number };
          delete?: { deleted?: number };
        };
        const ins = data.pull?.inserted ?? 0;
        const upd = data.pull?.updated ?? 0;
        const del = (data.pull?.deleted ?? 0) + (data.delete?.deleted ?? 0);
        const total = ins + upd + del;
        if (total > 0) {
          const { toast } = await import('sonner');
          const parts: string[] = [];
          if (ins) parts.push(`${ins} novo${ins > 1 ? 's' : ''}`);
          if (upd) parts.push(`${upd} atualizado${upd > 1 ? 's' : ''}`);
          if (del) parts.push(`${del} removido${del > 1 ? 's' : ''}`);
          toast.success(`Apple Calendar: ${parts.join(', ')}`);
        }
      }
    } catch {
      // Refresh continua mesmo se sync CalDAV falhar (não bloqueia UX)
    }
    void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    void queryClient.invalidateQueries({ queryKey: ['sidebar-members'] });
    setTimeout(() => setRefreshing(false), 600);
  }
  const pos = settings.sidebarPosition;
  const isVertical = pos === 'left' || pos === 'right';
  // O sino sempre aparece no TopBar do calendário (cluster flutuante foi removido).
  const showBell = true;
  // Reserva espaço pro botão hambúrguer (só desktop) quando a sidebar é vertical.
  const edgePadding = !isVertical
    ? ''
    : pos === 'left'
    ? 'md:pl-14'
    : 'md:pr-14';
  // Quando a sidebar fica no topo (top mode), TopBar do calendario tem que
  // sticky abaixo dela (68px) — senao fica oculto sob o z-20 da Sidebar ao rolar.
  const stickyTop = pos === 'top' ? 'top-[68px]' : pos === 'bottom' ? 'top-0' : 'top-0';

  return (
    <header className={cn(
      'h-14 flex items-center px-2 sm:px-4 gap-1.5 sm:gap-4 border-b border-surface-border bg-surface-elevated/80 backdrop-blur-sm sticky z-10',
      stickyTop,
      edgePadding
    )}>
      {/* Hairline dourado sob o cabeçalho — detalhe EQR */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Atalhos "1 sem" / "2 sem" — só desktop */}
      <div className="hidden sm:flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {[
          { label: t('calendar.shortcut.1week'), date: () => addWeeks(new Date(), 1) },
          { label: t('calendar.shortcut.2week'), date: () => addWeeks(new Date(), 2) },
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
          aria-label={t('calendar.openFilters')}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      )}

      {/* Seletor de view — ativo em dourado EQR */}
      <div className="flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5 flex-shrink-0">
        {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
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
            <span className="hidden sm:inline">{t('calendar.view.' + v)}</span>
            <span className="sm:hidden">{t('calendar.view.short.' + v)}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
        className="p-2 rounded-md border border-surface-border hover:bg-surface-overlay transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center flex-shrink-0 touch-manipulation"
        title="Sincronizar com Apple Calendar e atualizar"
        aria-label="Sincronizar agora"
      >
        <RefreshCw className={cn('w-4 h-4 text-text-muted', refreshing && 'animate-spin')} />
      </button>

      {showBell && <NotificationBell />}
    </header>
  );
}
