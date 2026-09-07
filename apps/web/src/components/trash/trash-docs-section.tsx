"use client";

import { useMutation } from "convex/react";
import { toast } from "sonner";
import { BookText } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DeletedTiming } from "./deleted-timing";
import { RestoreButton } from "./restore-button";
import { TrashSection } from "./trash-section";
import type { DeletedDoc, TrashSectionProps } from "./trash-items";

export function TrashDocsSection({
  docs,
  now,
  restoringId,
  onRestoringChange,
  emptying,
}: Omit<TrashSectionProps, "projectId"> & { docs: DeletedDoc[] | undefined }) {
  const restoreDoc = useMutation(api.features.docs.mutations.restore);

  async function handleRestoreDoc(docId: Id<"docs">, title: string) {
    onRestoringChange(docId);
    try {
      await restoreDoc({ docId });
      // Always comes back as a draft — nothing has reviewed it since it was
      // deleted, so it must not reappear readable to the team.
      toast.success(`Restored ${title} as a draft`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore page"
      );
    }
    onRestoringChange(null);
  }

  if (!docs || docs.length === 0) return null;

  return (
    <TrashSection icon={BookText} title="Documentation" count={docs.length}>
      {docs.map((doc) => (
        <div
          key={doc._id}
          className="flex items-center justify-between gap-4 px-6 py-3"
        >
          <div className="min-w-0 flex-1 opacity-60">
            <span className="text-sm font-semibold line-through text-ink-muted">
              {doc.title}
            </span>
            <p className="truncate font-mono text-xs text-ink-subtle">
              {doc.module}
            </p>
            {doc.deletedAt !== undefined && (
              <DeletedTiming deletedAt={doc.deletedAt} now={now} />
            )}
          </div>
          <RestoreButton
            restoring={restoringId === doc._id}
            emptying={emptying}
            onClick={() => handleRestoreDoc(doc._id, doc.title)}
          />
        </div>
      ))}
    </TrashSection>
  );
}
