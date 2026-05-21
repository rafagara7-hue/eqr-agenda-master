'use client';

import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@eqr/domain';
import { SyncStatusBadge } from './SyncStatusBadge';
import { ConflictIndicator } from './ConflictIndicator';
import { formatDate } from '@/lib/calendar/dateUtils';

interface EventCardProps {
  event: CalendarEvent;
  memberColor: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onDelete?: () => void;
  compact?: boolean;
  hasConflict?: boolean;
}

export function EventCard({ event, memberColor, style, onClick, onDelete, compact = false, hasConflict = false }: EventCardProps) {
  const isShort = !compact && event.endAt.getTime() - event.startAt.getTime() < 30 * 60 * 1000;
  const isTentative = event.status === 'tentative';
  const participantCount = event.participantIds?.length ?? 1;
  const isJoint = participantCount > 1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'event-card group overflow-hidden select-none',
        compact ? 'relative rounded-md px-1.5 py-0.5' : 'absolute rounded-md'
      )}
      style={{
        ...style,
        backgroundColor: `${memberColor}${isTentative ? '10' : '22'}`,
        borderLeft: `3px solid ${memberColor}`,
        borderColor: `${memberColor}${isTentative ? '44' : '55'}`,
        borderLeftColor: memberColor,
        ...(isTentative && {
          borderTopStyle: 'dashed',
          borderRightStyle: 'dashed',
          borderBottomStyle: 'dashed',
        }),
        opacity: isTentative ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      {/* Indicadores de topo */}
      <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
        {isJoint && (
          <span
            className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold"
            style={{ backgroundColor: `${memberColor}55`, color: memberColor }}
            title={`${participantCount} participantes`}
          >
            <Users className="w-2.5 h-2.5" />
            {participantCount}
          </span>
        )}
        {hasConflict && <ConflictIndicator />}
        {!onDelete && <SyncStatusBadge status={event.syncStatus} />}
        {onDelete && (
          <>
            <SyncStatusBadge status={event.syncStatus} className="group-hover:hidden" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-black/40 hover:bg-danger/80 transition-colors"
              title="Excluir evento"
            >
              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className={cn('pr-6', compact ? '' : 'p-1.5')}>
        <p
          className={cn(
            'font-medium leading-tight line-clamp-2',
            compact ? 'text-[11px]' : isShort ? 'text-[11px]' : 'text-xs'
          )}
          style={{ color: memberColor }}
        >
          {event.title}
        </p>

        {isTentative && !compact && !isShort && (
          <span
            className="inline-block text-[9px] font-medium px-1 rounded border mt-0.5"
            style={{ color: `${memberColor}BB`, borderColor: `${memberColor}55`, borderStyle: 'dashed' }}
          >
            Provisório
          </span>
        )}

        {!compact && !isShort && (
          <p className="text-[10px] mt-0.5" style={{ color: `${memberColor}99` }}>
            {formatDate(event.startAt, 'HH:mm')} – {formatDate(event.endAt, 'HH:mm')}
          </p>
        )}

        {!compact && event.location && !isShort && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: `${memberColor}80` }}>
            📍 {event.location}
          </p>
        )}
      </div>
    </motion.div>
  );
}
