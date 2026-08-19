import { DocsSidebar } from "@/components/DocsSidebar";
import { getNavigation } from "@/lib/content";

/**
 * Placeholder for a doc body, shared by the route's loading file and the
 * in-page boundary. The sidebar is disk content rather than URL-derived, so it
 * renders in full here; only the article column is a placeholder.
 */
export function DocSkeleton() {
  const sections = getNavigation();

  return (
    <div className="relative overflow-hidden">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          <DocsSidebar sections={sections} activeSlug="" />

          <main className="min-w-0 flex-1 lg:max-w-3xl">
            <div className="h-9 w-3/4 rounded bg-surface-raised" />
            <div className="mt-4 h-4 w-1/2 rounded bg-surface-raised/60" />
            <div className="mt-8 h-px w-full bg-line" />

            <div className="mt-10 space-y-4">
              {[
                "w-full",
                "w-11/12",
                "w-full",
                "w-4/5",
                "w-full",
                "w-10/12",
                "w-full",
                "w-3/4",
              ].map((w, i) => (
                <div
                  key={i}
                  className={`h-4 rounded bg-surface-raised/50 ${w}`}
                />
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
