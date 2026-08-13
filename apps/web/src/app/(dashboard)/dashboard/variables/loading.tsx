export default function VariablesLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-28 animate-pulse rounded bg-surface-raised" />
          <div className="mt-2 h-3 w-56 animate-pulse rounded bg-surface-raised/60" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="h-9 w-full animate-pulse rounded-lg bg-surface-raised sm:w-64" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-raised" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Variables table skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-3 w-3 shrink-0 animate-pulse rounded bg-surface-raised/60" />
              <div className="h-3 w-32 animate-pulse rounded bg-surface-raised" />
              <div className="h-3 w-40 animate-pulse rounded bg-surface-raised/60" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-surface-raised/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
