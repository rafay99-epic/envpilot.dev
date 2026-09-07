"use client";

import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useVariableSelectionStore } from "@/stores/variable-selection-store";
import { useBulkDeleteVariables } from "@/hooks/queries";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/project-detail");

// Floating multi-select bar and its delete confirmation.
export function BulkActionBar({
  projectId,
  organizationId,
  visibleVariableIds,
}: {
  projectId: Id<"projects"> | undefined;
  organizationId: Id<"organizations"> | undefined;
  visibleVariableIds: string[];
}) {
  const {
    selectedIds,
    isSelectionMode,
    isBulkDeleting,
    showConfirmDialog: showBulkDeleteConfirm,
    selectAll,
    clearSelection,
    exitSelectionMode,
    setBulkDeleting,
    setShowConfirmDialog: setShowBulkDeleteConfirm,
  } = useVariableSelectionStore();

  const bulkDelete = useBulkDeleteVariables();

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !projectId) return;

    setBulkDeleting(true);
    try {
      const result = await bulkDelete.mutateAsync({
        variableIds: Array.from(selectedIds),
        projectId,
      });

      toast.success(
        `Successfully deleted ${result.deletedCount} variable${result.deletedCount !== 1 ? "s" : ""}.`
      );
      exitSelectionMode();
    } catch (err) {
      log.error(
        "project_bulk_delete_failed",
        {
          projectId,
          selectedCount: selectedIds.size,
          organizationId,
        },
        err
      );
      toast.error(
        err instanceof Error ? err.message : "Failed to delete variables"
      );
    }
    // After the try/catch, not in a `finally`. One finalizer anywhere in this
    // component makes React Compiler bail on the WHOLE component, so the two
    // handlers here have to agree. The catch swallows and no branch inside
    // the try returns early.
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
  };

  return (
    <>
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="delete variables"
        message={`${selectedIds.size} variable${selectedIds.size !== 1 ? "s" : ""}. Recoverable from trash for 7 days, then the stored secret values are destroyed.`}
        confirmText={isBulkDeleting ? "Deleting..." : "Delete All"}
        variant="danger"
      />

      {isSelectionMode && selectedIds.size > 0 && (
        <FeatureGate
          organizationId={organizationId}
          featureKey="bulk_delete"
          featureName="Bulk Delete"
          fallbackVariant="inline"
        >
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 shadow-2xl">
              <span className="text-sm font-medium text-ink-muted">
                {selectedIds.size} variable{selectedIds.size !== 1 ? "s" : ""}{" "}
                selected
              </span>
              <button
                onClick={() => selectAll(visibleVariableIds)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Clear
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isBulkDeleting}
                className="rounded-lg bg-danger px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger disabled:opacity-50"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </FeatureGate>
      )}
    </>
  );
}
