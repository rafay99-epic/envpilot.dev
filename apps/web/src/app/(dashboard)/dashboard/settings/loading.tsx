export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-24 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-zinc-700/50 pb-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-t bg-zinc-800/60"
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-4 rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6">
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-800/60" />
              <div className="h-9 flex-1 animate-pulse rounded-lg bg-zinc-800/40" />
            </div>
          ))}
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    </div>
  );
}
