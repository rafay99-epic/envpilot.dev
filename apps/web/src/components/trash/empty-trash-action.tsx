"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ui";

// Permanent purge: the button plus its confirmation. `emptying` is owned by
// the page because it also disables every row's Restore button.
export function EmptyTrashAction({
  projectId,
  totalCount,
  emptying,
  onEmptyingChange,
}: {
  projectId: Id<"projects"> | undefined;
  totalCount: number;
  emptying: boolean;
  onEmptyingChange: (emptying: boolean) => void;
}) {
  const emptyTrash = useAction(api.features.vault.gc.emptyProjectTrash);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleEmptyTrash() {
    if (!projectId) return;
    onEmptyingChange(true);
    try {
      const result = await emptyTrash({ projectId });
      const purged =
        result.purgedVariables +
        result.purgedAccounts +
        result.purgedFiles +
        result.purgedDocs;
      if (result.skipped > 0) {
        toast.warning(
          `Permanently deleted ${purged} item${purged === 1 ? "" : "s"}; ${result.skipped} could not be purged and will be retried automatically.`
        );
      } else {
        toast.success(
          `Trash emptied — ${purged} item${purged === 1 ? "" : "s"} permanently deleted.`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to empty trash");
    }
    onEmptyingChange(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={emptying}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-2 text-sm font-medium transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50 text-danger"
      >
        {emptying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {emptying ? "Emptying…" : "Empty trash"}
      </button>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleEmptyTrash();
        }}
        title="Empty Trash"
        message={`Permanently delete all ${totalCount} item${totalCount === 1 ? "" : "s"} in the trash? Their secret values are destroyed in the vault immediately. This cannot be undone.`}
        confirmText="Empty trash"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}
