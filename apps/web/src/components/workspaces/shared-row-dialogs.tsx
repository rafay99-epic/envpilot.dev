"use client";

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui";
import { VariableEditModal } from "@/components/variables/variable-edit-modal";
import type { VariableFormData } from "@/components/variables/variable-form";
import {
  useDeleteVariable,
  useUpdateVariable,
} from "@/hooks/queries/useVariablesQuery";
import type { SharedRow } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

interface SharedRowDialogsProps {
  editing: SharedRow | null;
  deleting: SharedRow | null;
  showRotation: boolean;
  onClose: () => void;
}

/** Edit and delete for a shared row, written through its group. */
export function SharedRowDialogs({
  editing,
  deleting,
  showRotation,
  onClose,
}: SharedRowDialogsProps) {
  const updateVariable = useUpdateVariable();
  const deleteVariable = useDeleteVariable();

  async function handleUpdate(
    variableId: SharedRow["_id"],
    data: VariableFormData
  ) {
    if (!editing) return;
    try {
      const result = await updateVariable.mutateAsync({
        variableId,
        projectId: editing.workspace._id,
        value: data.value || undefined,
        description: data.description,
        environments: data.environments,
        isSensitive: data.isSensitive,
        changeReason: "Updated via dashboard",
        rotationFrequencyDays: data.rotationFrequencyDays,
        tagIds: data.tagIds,
      });
      toast.success(
        result.requested
          ? "Sent for approval."
          : `Updated in ${editing.reached.length} projects.`
      );
    } catch (error) {
      const message = sanitizeConvexError(error);
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteVariable.mutateAsync({
        variableId: deleting._id,
        projectId: deleting.workspace._id,
      });
      toast.success(`${deleting.key} deleted everywhere it was read.`);
      onClose();
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
  }

  const reach = deleting?.reached.length ?? 0;

  return (
    <>
      <VariableEditModal
        isOpen={editing !== null}
        onClose={onClose}
        variable={editing}
        onSave={handleUpdate}
        protectedEnvironments={editing?.protectedEnvironments}
        showRotation={showRotation}
        notice={editing && <EditNotice row={editing} />}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={onClose}
        onConfirm={handleDelete}
        title={`Delete ${deleting?.key ?? ""}?`}
        message={`${reach} projects read this value and lose the key on their next pull, sync or workflow run.`}
        confirmText="Delete"
        variant="danger"
        confirmPhrase={reach > 1 ? deleting?.key : undefined}
      />
    </>
  );
}

function EditNotice({ row }: { row: SharedRow }) {
  return (
    <div className="mb-4 space-y-1 border px-3 py-2 text-xs border-line text-ink-muted">
      <p>
        Shared. Saving changes it in {row.reached.length} projects:{" "}
        {row.reached.join(", ")}.
      </p>
      {row.protectedIn.length > 0 && (
        <p className="text-warning">
          {row.protectedIn.join(" and ")} protect{" "}
          {row.protectedEnvironments.join(", ")}. This will be filed as a change
          request for a second person to apply.
        </p>
      )}
    </div>
  );
}

/** Warning pill on a private row whose key other projects also own. */
export function DuplicateBadge({ others }: { others: number | undefined }) {
  if (!others) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
      same key in {others + 1} projects
    </span>
  );
}
