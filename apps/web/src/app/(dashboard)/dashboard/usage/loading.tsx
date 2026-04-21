export default function UsageLoading() {
  return (
    <div className="space-y-4">
      {/* Page header skeleton */}
      <div>
        <div className="h-6 w-36 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Tier badge + usage overview skeleton */}
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-20 animate-pulse rounded-full bg-zinc-800" />
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-800/60" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      </div>

      {/* Usage meters skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-5"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/60" />
                <div className="h-5 w-16 animate-pulse rounded bg-zinc-800" />
              </div>
            </div>
            <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-zinc-800" />
          </div>
        ))}
      </div>

      {/* Feature categories skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-700/50 bg-zinc-900/90"
          >
            <div className="border-b border-zinc-700/50 px-5 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
            </div>
            <div className="divide-y divide-zinc-800/50">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-5 py-3">
                  <div className="h-5 w-5 animate-pulse rounded bg-zinc-800/60" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
                    <div className="h-2 w-48 animate-pulse rounded bg-zinc-800/40" />
                  </div>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800/60" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
