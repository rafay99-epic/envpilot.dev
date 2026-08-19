export function ArticleSkeleton() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6 lg:pt-14">
      <div className="h-3.5 w-28 rounded bg-surface-raised/60" />

      <div className="mt-6 space-y-3">
        <div className="h-8 w-11/12 rounded bg-surface-raised" />
        <div className="h-8 w-3/5 rounded bg-surface-raised" />
      </div>

      <div className="mt-5 flex items-center gap-4">
        <div className="h-8 w-8 rounded-full bg-surface-raised" />
        <div className="h-3.5 w-32 rounded bg-surface-raised/60" />
        <div className="h-3.5 w-24 rounded bg-surface-raised/60" />
      </div>

      <div className="mt-8 h-px w-full bg-line" />

      <div className="mt-10 space-y-4">
        {[
          "w-full",
          "w-11/12",
          "w-full",
          "w-4/5",
          "w-full",
          "w-10/12",
          "w-3/4",
        ].map((w, i) => (
          <div key={i} className={`h-4 rounded bg-surface-raised/50 ${w}`} />
        ))}
      </div>
    </div>
  );
}
