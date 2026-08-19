import { DocsShell } from "@/components/shell";
import { DocSkeleton } from "@/components/doc-skeleton";

/**
 * The doc route's reusable shell. Partial Prefetching fetches one per route and
 * reuses it across every link pointing at it, so without this the sidebar's
 * sixty-odd links all prefetch an empty document.
 */
export default function DocLoading() {
  return (
    <DocsShell>
      <DocSkeleton />
    </DocsShell>
  );
}
