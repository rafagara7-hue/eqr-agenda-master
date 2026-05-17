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

const WEEK_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  memberColors: Record<string, string>;
  conflictEventIds?: Set<string>;
  onEventClick?: (event: CalendarEvent) => void;
  onDayClick?: (date: Date) => void;
  onDeleteEvent?: (id: string) => void;
}

export function MonthView({ currentDate, events, memberColors, conflictEventIds, onEventClick, onDayClick, onDeleteEvent }: MonthViewProps) {
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
        {WEEK_HEADERS.map((h) => (
          <div key={h} className="py-2 text-center text-[10px] font-medium text-text-muted uppercase tracking-wider">
            {h}
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
                  onClick={() => onDayClick?.(day)}
                >
                  {/* Número do dia */}
                  <div className="flex justify-end mb-1">
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                        today
                          ? 'bg-member-blue text-white'
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
