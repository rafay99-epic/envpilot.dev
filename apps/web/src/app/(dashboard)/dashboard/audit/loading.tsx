export default function AuditLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-28 animate-pulse rounded bg-surface-raised" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-raised/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-surface-raised" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-surface-raised" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-raised" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-raised" />
        <div className="h-9 w-48 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
              <div className="h-3 w-48 animate-pulse rounded bg-surface-raised/60" />
              <div className="ml-auto h-3 w-20 animate-pulse rounded bg-surface-raised/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
