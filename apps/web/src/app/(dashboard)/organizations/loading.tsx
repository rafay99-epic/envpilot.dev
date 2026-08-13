export default function OrganizationsLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-surface-raised" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-raised/60" />
        </div>
        <div className="h-10 w-44 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-line bg-surface p-6"
          >
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-lg bg-surface-raised" />
              <div className="min-w-0 flex-1">
                <div className="h-5 w-32 animate-pulse rounded bg-surface-raised" />
                <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-surface-raised/60" />
              </div>
            </div>
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-surface-raised/40" />
            <div className="mt-4 flex items-center justify-between">
              <div className="h-6 w-16 animate-pulse rounded-full bg-surface-raised" />
              <div className="h-4 w-4 animate-pulse rounded bg-surface-raised/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
