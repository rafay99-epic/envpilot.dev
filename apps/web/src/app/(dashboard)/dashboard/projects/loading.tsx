export default function ProjectsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-28 animate-pulse rounded bg-surface-raised" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-raised/60" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-lg bg-surface-raised" />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90"
          >
            <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2">
              <div className="h-2.5 w-2.5 rounded-full bg-surface-hover" />
              <div className="h-2.5 w-2.5 rounded-full bg-surface-hover" />
              <div className="h-2.5 w-2.5 rounded-full bg-surface-hover" />
              <div className="ml-2 h-3 w-24 animate-pulse rounded bg-surface-hover" />
            </div>
            <div className="flex-1 p-4">
              <div className="h-4 w-32 animate-pulse rounded bg-surface-raised" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-surface-raised/60" />
              <div className="mt-4 h-3 w-28 animate-pulse rounded bg-surface-raised/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
