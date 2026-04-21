export default function AnomaliesLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-44 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-10 w-20 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-800" />
              <div className="space-y-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
                <div className="h-5 w-10 animate-pulse rounded bg-zinc-800" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="h-9 w-36 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-9 w-36 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Events list skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="ml-2 h-3 w-32 animate-pulse rounded bg-zinc-700" />
        </div>
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-4 animate-pulse rounded bg-zinc-800/60" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-64 animate-pulse rounded bg-zinc-800" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800/60" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-zinc-800/60" />
                  <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
