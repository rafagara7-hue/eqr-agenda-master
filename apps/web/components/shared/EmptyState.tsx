import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-xl bg-surface-elevated border border-surface-border flex items-center justify-center text-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-text-primary font-medium text-sm">{title}</h3>
      {description && <p className="text-text-muted text-xs mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
