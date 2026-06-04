import { PRIORITY_META, type MeetingPriority, isHighPriority } from '@/lib/meetings/statuses';
import { cn } from '@/lib/utils';

export interface MeetingPriorityBadgeProps {
  priority: MeetingPriority;
  /** Se true, renderiza so quando high/urgent (uso comum nas listas) */
  highOnly?: boolean;
  className?: string;
}

export function MeetingPriorityBadge({ priority, highOnly = false, className }: MeetingPriorityBadgeProps) {
  if (highOnly && !isHighPriority(priority)) return null;
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        'inline-flex text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
        meta.bg, meta.color, meta.border,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
