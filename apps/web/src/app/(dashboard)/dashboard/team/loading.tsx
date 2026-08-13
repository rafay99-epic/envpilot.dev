export default function TeamLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-24 animate-pulse rounded bg-surface-raised" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-surface-raised/60" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Member rows skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-raised" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-36 animate-pulse rounded bg-surface-raised" />
                <div className="h-2.5 w-48 animate-pulse rounded bg-surface-raised/40" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-surface-raised/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
