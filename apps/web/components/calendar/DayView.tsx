'use client';

import { useMemo, useRef, useEffect } from 'react';
import { isSameDay, isToday, formatDate } from '@/lib/calendar/dateUtils';
import { EventCard } from './EventCard';
import { getMemberColor } from '@/lib/calendar/colorMap';
import type { CalendarEvent } from '@eqr/domain';

const HOUR_HEIGHT = 64;

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  memberColors: Record<string, string>;
  conflictEventIds?: Set<string>;
  favoriteEventIds?: Set<string>;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date) => void;
  onDeleteEvent?: (id: string) => void;
  workStart?: number;
  workEnd?: number;
  filteredHours?: boolean;
}

export function DayView({
  currentDate,
  events,
  memberColors,
  conflictEventIds,
  favoriteEventIds,
  onEventClick,
  onSlotClick,
  onDeleteEvent,
  workStart = 8,
  workEnd = 18,
  filteredHours = false,
}: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleStart = filteredHours ? workStart : 0;
  const visibleEnd   = filteredHours ? workEnd   : 24;
  const visibleHours = Array.from({ length: visibleEnd - visibleStart }, (_, i) => i + visibleStart);
  const totalHeight  = visibleHours.length * HOUR_HEIGHT;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: filteredHours ? 0 : workStart * HOUR_HEIGHT,
      behavior: 'instant',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workStart, filteredHours]);

  const dayEvents = useMemo(
    () =>
      events.filter((e) => {
        if (!isSameDay(e.startAt, currentDate)) return false;
        const startH = e.startAt.getHours() + e.startAt.getMinutes() / 60;
        const endH   = e.endAt.getHours()   + e.endAt.getMinutes()   / 60;
        return endH > visibleStart && startH < visibleEnd;
      }),
    [events, currentDate, visibleStart, visibleEnd]
  );

  function getEventStyle(event: CalendarEvent): React.CSSProperties {
    const startH       = event.startAt.getHours() + event.startAt.getMinutes() / 60;
    const endH         = event.endAt.getHours()   + event.endAt.getMinutes()   / 60;
    const clampedStart = Math.max(startH, visibleStart);
    const clampedEnd   = Math.min(endH,   visibleEnd);
    const top          = (clampedStart - visibleStart) * HOUR_HEIGHT;
    const height       = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 24);
    return { top: `${top}px`, height: `${height}px`, left: '64px', right: '8px' };
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="relative" style={{ minHeight: `${totalHeight}px` }}>
        {visibleHours.map((hour) => (
          <div
            key={hour}
            style={{ height: `${HOUR_HEIGHT}px` }}
            className={`flex border-b border-surface-border/40 hover:bg-surface-elevated/20 cursor-pointer group ${
              !filteredHours && (hour < workStart || hour >= workEnd) ? 'bg-surface-overlay/40' : ''
            }`}
            onClick={() => {
              const d = new Date(currentDate);
              d.setHours(hour, 0, 0, 0);
              onSlotClick?.(d);
            }}
          >
            {/* Label */}
            <div className="w-14 flex-shrink-0 flex items-start pt-0 pl-2 pr-3">
              <span className="text-text-muted text-[10px] font-medium -translate-y-2.5">
                {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </span>
            </div>

            {/* Slot */}
            <div className="flex-1 border-l border-surface-border/40 relative">
              <div className="absolute left-0 right-0 border-t border-surface-border/20" style={{ top: '50%' }} />
              <span className="absolute right-2 top-1 text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
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
            isFavorite={favoriteEventIds?.has(event.id)}
          />
        ))}
      </div>
    </div>
  );
}
