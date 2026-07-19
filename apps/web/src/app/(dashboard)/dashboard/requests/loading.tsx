export default function RequestsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-6 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Status tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800"
          />
        ))}
      </div>

      {/* Request list skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-zinc-700" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 animate-pulse rounded bg-zinc-800" />
                <div className="h-2.5 w-56 animate-pulse rounded bg-zinc-800/40" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-zinc-800/60" />
              <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
