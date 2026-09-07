"use client";

import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ui";
import { useDeleteVariable } from "@/hooks/queries";
import {
  sanitizeConvexError,
  getProtectedEnvironmentError,
} from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";
import type { Variable } from "./types";

const log = createLogger("app/dashboard/project-detail");

// Delete confirmation, including the "propose deletion" path for protected envs.
export function VariableDeleteDialog({
  variable,
  onClose,
  projectId,
  organizationId,
}: {
  variable: Variable | null;
  onClose: () => void;
  projectId: Id<"projects"> | undefined;
  organizationId: string | undefined;
}) {
  const deleteVariable = useDeleteVariable();
  const proposeChange = useAction(
    api.features.changeRequests.actions.createVariableChange
  );

  const handleDeleteVariable = async () => {
    if (!variable || !projectId) return;

    try {
      await deleteVariable.mutateAsync({
        variableId: variable._id,
        projectId,
      });

      onClose();
      toast.success("Variable deleted successfully.");
    } catch (err) {
      const blocked = getProtectedEnvironmentError(err);
      if (blocked) {
        const variableId = variable._id;
        onClose();
        toast.error(blocked.message, {
          action: {
            label: "Propose deletion",
            onClick: () => {
              void proposeChange({
                projectId,
                kind: "delete",
                variableId,
                source: "web",
              })
                .then(() => toast.success("Sent for approval."))
                .catch((proposeErr: unknown) =>
                  toast.error(sanitizeConvexError(proposeErr))
                );
            },
          },
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to delete variable";
      log.error(
        "project_variable_delete_failed",
        {
          projectId,
          variableId: variable._id,
          organizationId,
        },
        err
      );
      toast.error(message);
      throw err;
    }
  };

  return (
    <ConfirmDialog
      isOpen={!!variable}
      onClose={onClose}
      onConfirm={handleDeleteVariable}
      title="delete variable"
      message={`Recoverable from trash for 7 days, then the stored secret value is destroyed.`}
      confirmText="Delete"
      variant="danger"
      confirmPhrase={variable?.key}
    />
  );
}
