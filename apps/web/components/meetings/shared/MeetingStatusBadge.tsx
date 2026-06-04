import { STATUS_META, type MeetingStatus } from '@/lib/meetings/statuses';
import { cn } from '@/lib/utils';

export interface MeetingStatusBadgeProps {
  status: MeetingStatus;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Badge de status. Visual unico — mude STATUS_META em lib/meetings/statuses.ts
 * pra propagar a mudanca em todo o app.
 */
export function MeetingStatusBadge({ status, size = 'xs', className }: MeetingStatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.expired;
  const sizeCls = size === 'sm'
    ? 'text-xs px-3 py-1'
    : 'text-[10px] px-2.5 py-1';
  return (
    <span
      className={cn(
        'inline-flex uppercase tracking-wider font-medium rounded-full border whitespace-nowrap',
        sizeCls,
        meta.bg, meta.color, meta.border,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
