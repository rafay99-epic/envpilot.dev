export default function AuditLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-28 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-700" />
        </div>
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-48 animate-pulse rounded bg-zinc-800/60" />
              <div className="ml-auto h-3 w-20 animate-pulse rounded bg-zinc-800/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
