export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* TopBar skeleton */}
      <div className="h-14 flex items-center px-4 gap-4 border-b border-surface-border bg-surface-elevated/80">
        <div className="h-8 w-32 rounded-lg shimmer" />
        <div className="h-4 w-48 rounded shimmer" />
        <div className="flex-1" />
        <div className="h-8 w-40 rounded-lg shimmer" />
      </div>

      {/* Filtros skeleton */}
      <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-base">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-full shimmer" />
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="flex-1 grid grid-cols-7 gap-px bg-surface-border/40 p-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-surface-base p-2 space-y-2">
            <div className="h-3 w-10 rounded shimmer" />
            <div className="h-12 rounded shimmer opacity-60" />
            <div className="h-12 rounded shimmer opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
}
