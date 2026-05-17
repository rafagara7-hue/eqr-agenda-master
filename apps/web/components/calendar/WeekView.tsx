'use client';

import { useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getWeekDays, formatDate, isSameDay, isToday } from '@/lib/calendar/dateUtils';
import { EventCard } from './EventCard';
import { getMemberColor } from '@/lib/calendar/colorMap';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@eqr/domain';

const HOUR_HEIGHT = 60;
// Minimum column width for each day (ensures horizontal scroll on narrow screens)
const MIN_COL_WIDTH = 52;

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  memberColors: Record<string, string>;
  conflictEventIds?: Set<string>;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date) => void;
  onDeleteEvent?: (id: string) => void;
  workStart?: number;
  workEnd?: number;
  filteredHours?: boolean;
}

export function WeekView({
  currentDate,
  events,
  memberColors,
  conflictEventIds,
  onEventClick,
  onSlotClick,
  onDeleteEvent,
  workStart = 8,
  workEnd = 18,
  filteredHours = false,
}: WeekViewProps) {
  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleStart = filteredHours ? workStart : 0;
  const visibleEnd   = filteredHours ? workEnd   : 24;
  const visibleHours = Array.from({ length: visibleEnd - visibleStart }, (_, i) => i + visibleStart);
  const totalHeight  = visibleHours.length * HOUR_HEIGHT;

  // hour-col (w-14 = 56px) + 7 × MIN_COL_WIDTH
  const minContentWidth = 56 + 7 * MIN_COL_WIDTH;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: filteredHours ? 0 : workStart * HOUR_HEIGHT,
      behavior: 'instant',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workStart, filteredHours]);

  function getEventsForDay(day: Date): CalendarEvent[] {
    return events.filter((e) => {
      if (!isSameDay(e.startAt, day)) return false;
      const startH = e.startAt.getHours() + e.startAt.getMinutes() / 60;
      const endH   = e.endAt.getHours()   + e.endAt.getMinutes()   / 60;
      return endH > visibleStart && startH < visibleEnd;
    });
  }

  function getEventStyle(event: CalendarEvent): React.CSSProperties {
    const startH        = event.startAt.getHours() + event.startAt.getMinutes() / 60;
    const endH          = event.endAt.getHours()   + event.endAt.getMinutes()   / 60;
    const clampedStart  = Math.max(startH, visibleStart);
    const clampedEnd    = Math.min(endH,   visibleEnd);
    const top           = (clampedStart - visibleStart) * HOUR_HEIGHT;
    const height        = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 20);
    return { top: `${top}px`, height: `${height}px`, left: '2px', right: '2px' };
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/*
        Single scroll container for both axes:
        - overflow-auto → scrolls vertically (work hours) AND horizontally (7 days on mobile)
        - sticky top-0 on header works within this container
        - sticky left-0 on hour column works within this container
      */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {/* Min-width forces horizontal scroll on narrow screens */}
        <div style={{ minWidth: `${minContentWidth}px` }}>
          {/* Cabeçalho dos dias — sticky within scroll container */}
          <div className="flex border-b border-surface-border bg-surface-elevated z-10 sticky top-0">
            <div className="w-14 flex-shrink-0" />
            {days.map((day) => {
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 min-w-0 py-2 text-center border-l border-surface-border/40"
                  style={{ minWidth: `${MIN_COL_WIDTH}px` }}
                >
                  <p className="text-text-muted text-[10px] uppercase tracking-wider">
                    {formatDate(day, 'EEE')}
                  </p>
                  <div
                    className={cn(
                      'mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
                      today
                        ? 'bg-member-blue text-white'
                        : 'text-text-secondary hover:bg-surface-overlay'
                    )}
                  >
                    {formatDate(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grade de horas */}
          <div className="flex" style={{ height: `${totalHeight}px` }}>
            {/* Coluna de horas — sticky left within scroll container */}
            <div className="w-14 flex-shrink-0 sticky left-0 bg-surface-elevated z-10">
              {visibleHours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="flex items-start pt-0 pl-2 pr-3 border-b border-surface-border/40"
                >
                  <span className="text-text-muted text-[10px] font-medium -translate-y-2.5">
                    {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                  </span>
                </div>
              ))}
            </div>

            {/* Colunas dos dias */}
            {days.map((day) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative border-l border-surface-border/40 h-full"
                  style={{ minWidth: `${MIN_COL_WIDTH}px` }}
                >
                  {visibleHours.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className={`border-b border-surface-border/40 hover:bg-surface-elevated/30 cursor-pointer relative ${
                        !filteredHours && (hour < workStart || hour >= workEnd) ? 'bg-surface-overlay/40' : ''
                      }`}
                      onClick={() => {
                        const d = new Date(day);
                        d.setHours(hour, 0, 0, 0);
                        onSlotClick?.(d);
                      }}
                    >
                      <div className="absolute left-0 right-0 border-t border-surface-border/20" style={{ top: '50%' }} />
                    </div>
                  ))}

                  {dayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      memberColor={memberColors[event.memberId] ?? getMemberColor('')}
                      style={getEventStyle(event)}
                      onClick={() => onEventClick?.(event)}
                      onDelete={onDeleteEvent ? () => onDeleteEvent(event.id) : undefined}
                      hasConflict={conflictEventIds?.has(event.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
