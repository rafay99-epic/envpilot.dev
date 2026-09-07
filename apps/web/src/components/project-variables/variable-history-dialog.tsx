"use client";

import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import { VariableHistory } from "@/components/variables";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useVariableHistory as useConvexVariableHistory } from "@/hooks";
import { useRollbackVariable } from "@/hooks/queries";
import { createLogger } from "@/lib/logger";
import type { VersionRecord } from "./types";

const log = createLogger("app/dashboard/project-detail");

// Version history drawer for one variable, plus its rollback action.
export function VariableHistoryDialog({
  variableId,
  variableKey,
  currentVersion,
  onClose,
  projectId,
  organizationId,
  convexUserId,
  canRollback,
}: {
  variableId: string | null;
  variableKey: string;
  currentVersion: number;
  onClose: () => void;
  projectId: Id<"projects"> | undefined;
  organizationId: Id<"organizations"> | undefined;
  convexUserId: Id<"users"> | undefined;
  canRollback: boolean;
}) {
  const rollbackVariable = useRollbackVariable();
  const rawHistory = useConvexVariableHistory(
    variableId ? (variableId as Id<"environmentVariables">) : undefined,
    convexUserId
  );
  const historyData = rawHistory
    ? { history: rawHistory as VersionRecord[] }
    : undefined;
  const isLoadingHistory = !!variableId && rawHistory === undefined;
  const historyQueryError = null;

  const handleRollback = async (targetVersion: number) => {
    if (!variableId || !projectId) return;

    try {
      const { valueRestored } = await rollbackVariable.mutateAsync({
        variableId,
        projectId,
        targetVersion,
      });

      toast.success(`Rolled back ${variableKey} to version ${targetVersion}.`);

      if (valueRestored) {
        toast.success(`Rolled back to version ${targetVersion}`, {
          description: "Value and settings restored.",
        });
      } else {
        toast.warning(
          `Rolled back to version ${targetVersion} — settings only`,
          {
            description:
              "This version predates value history, so the secret value could not be restored and is unchanged.",
          }
        );
      }
    } catch (err) {
      log.error(
        "project_variable_rollback_failed",
        {
          projectId,
          variableId,
          targetVersion,
          organizationId,
        },
        err
      );
      const message =
        err instanceof Error ? err.message : "Failed to rollback variable";
      toast.error(message);
      toast.error(message);
    }
  };

  if (!variableId) return null;

  return (
    <FeatureGate
      organizationId={organizationId}
      featureKey="variable_version_history"
      featureName="Version History"
      fallbackVariant="inline"
    >
      <VariableHistory
        isOpen={!!variableId}
        onClose={onClose}
        variableKey={variableKey}
        currentVersion={currentVersion}
        history={(historyData?.history ?? []) as VersionRecord[]}
        onRollback={handleRollback}
        canRollback={canRollback}
        isLoading={isLoadingHistory}
        error={
          historyQueryError
            ? "Failed to load version history. Please try again."
            : null
        }
      />
    </FeatureGate>
  );
}
