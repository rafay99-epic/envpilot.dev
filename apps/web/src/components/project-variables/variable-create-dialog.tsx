"use client";

import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import {
  VariableCreateDrawer,
  type VariableFormData,
} from "@/components/variables";
import { useCreateVariable } from "@/hooks/queries";
import { sanitizeConvexError, isTierLimitError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/project-detail");

// Add/Request Variable drawer plus the create mutation behind it.
export function VariableCreateDialog({
  isOpen,
  onClose,
  projectId,
  organizationId,
  canCreateVariable,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects"> | undefined;
  organizationId: string | undefined;
  canCreateVariable: boolean;
}) {
  const createVariable = useCreateVariable(canCreateVariable);

  const handleCreateVariable = async (
    data: VariableFormData,
    options?: { silent?: boolean }
  ): Promise<{ requested: boolean }> => {
    if (!projectId) return { requested: false };
    try {
      const result = await createVariable.mutateAsync({
        key: data.key,
        value: data.value,
        description: data.description || undefined,
        environments: data.environments,
        projectId,
        isSensitive: data.isSensitive,
        rotationFrequencyDays: data.rotationFrequencyDays,
        tagIds: data.tagIds,
      });

      // A bulk paste reports its own single summary, so per-variable toasts
      // would stack one per entry behind it.
      if (!options?.silent) {
        toast.success(
          result.requested
            ? "Sent for approval."
            : "Variable created successfully."
        );
      }
      return { requested: result.requested };
    } catch (err) {
      // Convex redacts plain Error messages to "Server Error" in production,
      // so the readable text only survives inside a ConvexError payload.
      // sanitizeConvexError unwraps it; the classifiers read the result.
      const raw = sanitizeConvexError(err);
      const message = isTierLimitError(raw)
        ? "Variable limit reached. Upgrade to Pro for unlimited variables."
        : // A conflict names the clashing environment(s) — surface it
          // verbatim (same key across DIFFERENT environments is legal).
          raw || "Failed to create variable";
      log.error(
        "project_variable_create_failed",
        {
          projectId,
          organizationId,
          key: data.key,
          environments: data.environments,
        },
        err
      );
      if (!options?.silent) toast.error(message);
      // Re-throw with the friendly message — the create drawer's form shows
      // err.message in its inline banner, never the raw backend text. A silent
      // caller still needs the throw: that is how it counts the failure.
      throw new Error(message);
    }
  };

  return (
    <VariableCreateDrawer
      isOpen={isOpen}
      onClose={onClose}
      onCreate={handleCreateVariable}
      organizationId={organizationId}
      projectId={projectId}
      title={canCreateVariable ? "Add Variables" : "Request Variables"}
      submitLabel={canCreateVariable ? "Create Variable" : "Submit Request"}
    />
  );
}
