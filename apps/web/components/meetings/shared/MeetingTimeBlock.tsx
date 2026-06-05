import { Calendar as CalendarIcon } from 'lucide-react';
import { formatMeetingDateTime, formatMeetingTime } from '@/lib/meetings/format';
import { cn } from '@/lib/utils';

export interface MeetingTimeBlockProps {
  startIso: string;
  endIso?: string;
  rescheduled?: boolean;
  variant?: 'inline' | 'block';
  className?: string;
}

/**
 * Bloco "data + horario" padronizado. Usado em cards de pendente, detalhe, lista.
 * variant=inline: span dentro de paragrafo
 * variant=block: caixa com fundo e icone
 */
export function MeetingTimeBlock({
  startIso, endIso, rescheduled, variant = 'block', className,
}: MeetingTimeBlockProps) {
  const dateTimeStr = formatMeetingDateTime(startIso);
  const endTimeStr = endIso ? formatMeetingTime(endIso) : null;

  if (variant === 'inline') {
    return (
      <span className={cn('text-text-secondary', className)}>
        {dateTimeStr}
        {endTimeStr && <span className="text-text-muted"> — {endTimeStr}</span>}
        {rescheduled && <span className="text-info ml-1 text-[10px]">(reagendado)</span>}
      </span>
    );
  }

  return (
    <div className={cn(
      'bg-surface-overlay rounded-lg p-3 text-xs flex items-center gap-2',
      className,
    )}>
      <CalendarIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
      <div>
        <span className="text-text-primary font-medium">{dateTimeStr}</span>
        {endTimeStr && <span className="text-text-muted"> — {endTimeStr}</span>}
        {rescheduled && (
          <span className="text-info ml-2 text-[10px]">(reagendamento sugerido)</span>
        )}
      </div>
    </div>
  );
}
