export default function DashboardHomeLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-3 w-32 animate-pulse rounded bg-surface-raised/60" />
          <div className="mt-2 h-6 w-56 animate-pulse rounded bg-surface-raised" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Stat cards skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-raised/60" />
              <div className="h-5 w-12 animate-pulse rounded bg-surface-raised" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-raised/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity list skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-surface-hover" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-raised" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-surface-raised/40" />
              </div>
              <div className="h-2.5 w-16 animate-pulse rounded bg-surface-raised/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
