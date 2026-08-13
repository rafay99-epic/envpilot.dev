// Deterministic bar heights for chart skeleton — avoids Math.random() in render
const BAR_HEIGHTS = [
  35, 58, 42, 71, 28, 63, 49, 76, 33, 55, 44, 68, 31, 60, 47, 73, 38, 52, 65,
  40,
];

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-raised/60" />
          <div className="mt-2 h-6 w-24 animate-pulse rounded bg-surface-raised" />
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface/50 p-1">
          <div className="h-8 w-12 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-8 w-12 animate-pulse rounded-md bg-surface-raised/60" />
          <div className="h-8 w-12 animate-pulse rounded-md bg-surface-raised/60" />
        </div>
      </div>

      {/* Activity chart skeleton */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-surface-hover" />
          <div className="h-3 w-3 rounded-full bg-surface-hover" />
          <div className="h-3 w-3 rounded-full bg-surface-hover" />
          <div className="ml-2 h-3 w-32 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="p-6">
          <div className="flex h-48 items-end gap-1">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-surface-raised/60"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Two-column chart skeletons */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-line bg-surface/90"
          >
            <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="ml-2 h-3 w-28 animate-pulse rounded bg-surface-hover" />
            </div>
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-3 w-20 animate-pulse rounded bg-surface-raised" />
                  <div
                    className="h-6 animate-pulse rounded bg-surface-raised/60"
                    style={{ width: `${70 - j * 15}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Team + Resource breakdown skeletons */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-line bg-surface/90"
          >
            <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="h-3 w-3 rounded-full bg-surface-hover" />
              <div className="ml-2 h-3 w-24 animate-pulse rounded bg-surface-hover" />
            </div>
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-surface-raised" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
                    <div className="h-2 w-16 animate-pulse rounded bg-surface-raised/40" />
                  </div>
                  <div className="h-3 w-8 animate-pulse rounded bg-surface-raised/60" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Security insights skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface/90 p-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-raised" />
              <div className="space-y-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-surface-raised/60" />
                <div className="h-5 w-10 animate-pulse rounded bg-surface-raised" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
