"use client";

import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import {
  VariableEditModal,
  type VariableFormData,
} from "@/components/variables";
import { useCreateTag, useProtection, type Tag } from "@/hooks";
import { useUpdateVariable } from "@/hooks/queries";
import { createLogger } from "@/lib/logger";
import type { Variable } from "./types";

const log = createLogger("app/dashboard/project-detail");

// Edit modal for one of this project's own variables.
export function VariableEditDialog({
  variable,
  onClose,
  projectId,
  organizationId,
  convexUserId,
  showRotation,
  showTags,
  tags,
}: {
  variable: Variable | null;
  onClose: () => void;
  projectId: Id<"projects"> | undefined;
  organizationId: string | undefined;
  convexUserId: Id<"users"> | undefined;
  showRotation: boolean;
  showTags: boolean;
  tags: Tag[];
}) {
  const updateVariable = useUpdateVariable();
  const createTag = useCreateTag();
  const protection = useProtection(projectId);

  const handleUpdateVariable = async (
    variableId: Id<"environmentVariables">,
    data: VariableFormData
  ) => {
    if (!projectId) return;
    try {
      const result = await updateVariable.mutateAsync({
        variableId,
        projectId,
        value: data.value || undefined,
        // Send "" through (not undefined) so a cleared description is
        // actually removed server-side — see convex/variables.ts update.
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
          : "Variable updated successfully."
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update variable";
      log.error(
        "project_variable_update_failed",
        {
          projectId,
          variableId,
          organizationId,
          environments: data.environments,
        },
        err
      );
      toast.error(message);
      throw err;
    }
  };

  return (
    <VariableEditModal
      isOpen={!!variable}
      onClose={onClose}
      variable={variable}
      onSave={handleUpdateVariable}
      protectedEnvironments={protection?.environments}
      allowedEnvironments={protection?.allowedEnvironments}
      showRotation={showRotation}
      availableTags={tags}
      onCreateTag={
        showTags
          ? async (name, color) => {
              if (!organizationId || !convexUserId) return;
              await createTag.mutateAsync({
                organizationId,
                name,
                color,
              });
            }
          : undefined
      }
    />
  );
}
