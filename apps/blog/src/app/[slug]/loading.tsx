import { BlogShell } from "@/components/shell";
import { ArticleSkeleton } from "@/components/article-skeleton";

/**
 * The post route's reusable shell. Partial Prefetching fetches one per route
 * and reuses it for every link pointing at it, so without this the index's
 * twenty-odd post links all prefetch an empty document.
 */
export default function PostLoading() {
  return (
    <BlogShell>
      <ArticleSkeleton />
    </BlogShell>
  );
}
