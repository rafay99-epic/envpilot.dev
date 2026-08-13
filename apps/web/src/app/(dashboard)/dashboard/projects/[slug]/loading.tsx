export default function ProjectDetailLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Project header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-raised" />
          <div>
            <div className="h-6 w-40 animate-pulse rounded bg-surface-raised" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-surface-raised/60" />
          </div>
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Environment tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-lg bg-surface-raised"
          />
        ))}
      </div>

      {/* Variables table skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="flex items-center justify-between border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-32 animate-pulse rounded bg-surface-hover" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-surface-raised" />
              <div className="h-3 w-48 animate-pulse rounded bg-surface-raised/60" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-surface-raised/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
