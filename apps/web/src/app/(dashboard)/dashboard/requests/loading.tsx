export default function RequestsLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Header skeleton */}
      <div>
        <div className="h-6 w-32 animate-pulse rounded bg-surface-raised" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-surface-raised/60" />
      </div>

      {/* Status tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-lg bg-surface-raised"
          />
        ))}
      </div>

      {/* Request list skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-surface-hover" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-raised" />
                <div className="h-2.5 w-56 animate-pulse rounded bg-surface-raised/40" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-surface-raised/60" />
              <div className="h-8 w-20 animate-pulse rounded-lg bg-surface-raised" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
