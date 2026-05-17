import { cn } from '@/lib/utils';
import { getSyncStatusColor, getSyncStatusLabel } from '@/lib/calendar/colorMap';

interface SyncStatusBadgeProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

export function SyncStatusBadge({ status, className, showLabel = false }: SyncStatusBadgeProps) {
  const color = getSyncStatusColor(status);
  const label = getSyncStatusLabel(status);

  return (
    <span className={cn('sync-badge', className)}>
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          status === 'pending' && 'animate-pulse'
        )}
        style={{ backgroundColor: color }}
      />
      {showLabel && <span className="text-text-muted" style={{ color }}>{label}</span>}
    </span>
  );
}
