export default function ProjectDetailLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      {/* Project header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-800" />
          <div>
            <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-zinc-800/60" />
          </div>
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
      </div>

      {/* Environment tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800"
          />
        ))}
      </div>

      {/* Variables table skeleton */}
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="flex items-center justify-between border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-32 animate-pulse rounded bg-zinc-700" />
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-700" />
        </div>
        <div className="divide-y divide-zinc-800/50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-48 animate-pulse rounded bg-zinc-800/60" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-zinc-800/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
