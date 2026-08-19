import { DocsShell } from "@/components/shell";
import { DocSkeleton } from "@/components/doc-skeleton";

export default function DocLoading() {
  return (
    <DocsShell>
      <DocSkeleton />
    </DocsShell>
  );
}
