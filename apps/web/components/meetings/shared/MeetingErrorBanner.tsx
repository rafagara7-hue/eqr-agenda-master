import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MeetingErrorBannerProps {
  visible: boolean;
  message?: string;
  className?: string;
}

/**
 * Banner amarelo "alguns dados podem estar incompletos".
 * Renderiza somente quando visible=true.
 */
export function MeetingErrorBanner({
  visible,
  message = 'Alguns dados podem estar incompletos. Recarregue a página em instantes.',
  className,
}: MeetingErrorBannerProps) {
  if (!visible) return null;
  return (
    <div className={cn(
      'mb-4 px-4 py-3 rounded-lg border border-warning/40 bg-warning/10 text-warning text-xs flex items-start gap-2',
      className,
    )}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
