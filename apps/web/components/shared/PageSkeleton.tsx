/**
 * Skeleton loader genérico usado em loading.tsx das rotas.
 * Server component puro — sem dependências de client.
 */

interface PageSkeletonProps {
  /** Quantidade de cards/linhas no skeleton */
  rows?: number;
  /** Quantos cards lado a lado em desktop (grid responsivo) */
  cols?: 1 | 2 | 3 | 4 | 6;
  /** Esconder header? */
  noHeader?: boolean;
}

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6',
};

export function PageSkeleton({ rows = 4, cols = 2, noHeader = false }: PageSkeletonProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {!noHeader && (
        <div className="space-y-2">
          <div className="h-6 w-32 rounded shimmer" />
          <div className="h-4 w-72 max-w-full rounded shimmer" />
        </div>
      )}
      <div className={`grid ${colsClass[cols]} gap-3 sm:gap-5`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="bg-surface-elevated border border-surface-border rounded-xl p-5 space-y-3"
          >
            <div className="h-3 w-24 rounded shimmer" />
            <div className="h-10 w-16 rounded shimmer" />
            <div className="h-3 w-40 max-w-full rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
