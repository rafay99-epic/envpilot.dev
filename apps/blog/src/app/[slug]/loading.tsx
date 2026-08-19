import { BlogShell } from "@/components/shell";
import { ArticleSkeleton } from "@/components/article-skeleton";

export default function PostLoading() {
  return (
    <BlogShell>
      <ArticleSkeleton />
    </BlogShell>
  );
}
