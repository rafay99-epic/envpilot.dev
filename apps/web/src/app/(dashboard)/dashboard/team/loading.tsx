export default function TeamLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-24 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Member rows skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-36 animate-pulse rounded bg-zinc-800" />
                <div className="h-2.5 w-48 animate-pulse rounded bg-zinc-800/40" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
