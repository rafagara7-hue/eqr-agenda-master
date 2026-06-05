import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConflictIndicatorProps {
  className?: string;
  count?: number;
}

export function ConflictIndicator({ className, count }: ConflictIndicatorProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5',
        'bg-sync-conflict/20 border border-sync-conflict/40',
        className
      )}
      title={`${count ?? 1} conflito(s) detectado(s)`}
    >
      <AlertTriangle className="w-2.5 h-2.5 text-sync-conflict" />
      {count && count > 1 && (
        <span className="text-sync-conflict text-[9px] font-bold">{count}</span>
      )}
    </span>
  );
}
