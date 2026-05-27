'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getMonthDays, getWeekDays, startOfMonth, isSameDay, isSameMonth,
  isToday, formatDate, startOfWeek, addDays, endOfMonth, eachDayOfInterval,
} from '@/lib/calendar/dateUtils';
import { EventCard } from './EventCard';
import { getMemberColor } from '@/lib/calendar/colorMap';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@eqr/domain';

const WEEK_HEADERS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_HEADERS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  memberColors: Record<string, string>;
  conflictEventIds?: Set<string>;
  favoriteEventIds?: Set<string>;
  onEventClick?: (event: CalendarEvent) => void;
  onDayClick?: (date: Date) => void;
  /** Mobile-only: ao tocar num dia, abre o painel de novo evento já pré-preenchido com a data. */
  onDayCreate?: (date: Date) => void;
  onDeleteEvent?: (id: string) => void;
}

const MOBILE_BREAKPOINT = 640;

export function MonthView({ currentDate, events, memberColors, conflictEventIds, favoriteEventIds, onEventClick, onDayClick, onDayCreate, onDeleteEvent }: MonthViewProps) {
  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(currentDate);
    const lastDay = endOfMonth(currentDate);
    const start = startOfWeek(firstDay, { weekStartsOn: 0 });
    const endDate = addDays(startOfWeek(addDays(lastDay, 7), { weekStartsOn: 0 }), -1);
    return eachDayOfInterval({ start, end: endDate });
  }, [currentDate]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  function getEventsForDay(day: Date): CalendarEvent[] {
    return events
      .filter((e) => isSameDay(e.startAt, day))
      .slice(0, 3);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 border-b border-surface-border">
        {WEEK_HEADERS_SHORT.map((short, i) => (
          <div key={short} className="py-2 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider truncate">
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{WEEK_HEADERS_FULL[i]}</span>
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-surface-border last:border-0">
            {week.map((day) => {
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const dayEvents = getEventsForDay(day);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-l border-surface-border/40 first:border-0 p-1 min-h-[70px] sm:min-h-[90px] cursor-pointer',
                    'hover:bg-surface-elevated/40 transition-colors',
                    !inMonth && 'opacity-40'
                  )}
                  onClick={() => {
                    // Mobile: tap no dia abre direto o formulário de novo evento (data pré-preenchida)
                    // Desktop: tap muda pra DayView (comportamento atual)
                    if (typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT && onDayCreate) {
                      onDayCreate(day);
                    } else {
                      onDayClick?.(day);
                    }
                  }}
                >
                  {/* Número do dia */}
                  <div className="flex justify-end mb-1">
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                        today
                          ? 'bg-accent text-brand shadow-glow-accent'
                          : 'text-text-secondary'
                      )}
                    >
                      {formatDate(day, 'd')}
                    </span>
                  </div>

                  {/* Eventos do dia */}
                  <div className="space-y-0.5">
                    {dayEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        memberColor={memberColors[event.memberId] ?? getMemberColor('')}
                        compact
                        onClick={(e) => {
                          e?.stopPropagation?.();
                          onEventClick?.(event);
                        }}
                        onDelete={onDeleteEvent ? () => onDeleteEvent(event.id) : undefined}
                        hasConflict={conflictEventIds?.has(event.id)}
                        isFavorite={favoriteEventIds?.has(event.id)}
                      />
                    ))}
                    {events.filter((e) => isSameDay(e.startAt, day)).length > 3 && (
                      <p className="text-text-muted text-[10px] px-1">
                        +{events.filter((e) => isSameDay(e.startAt, day)).length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
