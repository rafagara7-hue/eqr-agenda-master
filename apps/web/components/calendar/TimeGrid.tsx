'use client';

import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TimeGridProps {
  className?: string;
  children?: React.ReactNode;
  onSlotClick?: (hour: number, minute: number) => void;
}

export function TimeGrid({ className, children, onSlotClick }: TimeGridProps) {
  return (
    <div className={cn('relative', className)}>
      {HOURS.map((hour) => (
        <div key={hour} className="time-slot flex" style={{ height: '60px' }}>
          {/* Label da hora */}
          <div className="w-14 flex-shrink-0 flex items-start pt-0 pl-2 pr-3">
            <span className="text-text-muted text-[10px] font-medium -translate-y-2.5">
              {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
            </span>
          </div>

          {/* Área clicável */}
          <div
            className="flex-1 border-l border-surface-border/40 relative"
            onClick={() => onSlotClick?.(hour, 0)}
          >
            {/* Meia-hora */}
            <div
              className="absolute left-0 right-0 border-t border-surface-border/20"
              style={{ top: '50%' }}
            />
          </div>
        </div>
      ))}

      {/* Conteúdo (eventos) sobreposto */}
      {children}
    </div>
  );
}
