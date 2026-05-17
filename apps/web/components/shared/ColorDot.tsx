import { cn } from '@/lib/utils';

interface ColorDotProps {
  color: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const sizeMap = { xs: 'w-1.5 h-1.5', sm: 'w-2 h-2', md: 'w-2.5 h-2.5' };

export function ColorDot({ color, size = 'sm', className }: ColorDotProps) {
  return (
    <span
      className={cn('rounded-full inline-block flex-shrink-0', sizeMap[size], className)}
      style={{ backgroundColor: color }}
    />
  );
}
