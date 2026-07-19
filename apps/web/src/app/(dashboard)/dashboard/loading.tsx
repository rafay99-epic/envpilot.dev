export default function DashboardHomeLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-3 w-32 animate-pulse rounded bg-zinc-800/60" />
          <div className="mt-2 h-6 w-56 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Stat cards skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-700" />
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
              <div className="h-5 w-12 animate-pulse rounded bg-zinc-800" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-zinc-800/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity list skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-700" />
        </div>
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-zinc-700" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-40 animate-pulse rounded bg-zinc-800" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800/40" />
              </div>
              <div className="h-2.5 w-16 animate-pulse rounded bg-zinc-800/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
