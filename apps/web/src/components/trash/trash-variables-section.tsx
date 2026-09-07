"use client";

import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getProtectedEnvironmentError,
  sanitizeConvexError,
} from "@/lib/error-messages";
import { DeletedTiming } from "./deleted-timing";
import { RestoreButton } from "./restore-button";
import { TrashSection } from "./trash-section";
import type { DeletedVariable, TrashSectionProps } from "./trash-items";

export function TrashVariablesSection({
  variables,
  projectId,
  now,
  restoringId,
  onRestoringChange,
  emptying,
}: TrashSectionProps & { variables: DeletedVariable[] | undefined }) {
  const restoreVariable = useMutation(api.features.variables.mutations.restore);
  const proposeChange = useAction(
    api.features.changeRequests.actions.createVariableChange
  );

  async function handleRestoreVariable(
    variableId: Id<"environmentVariables">,
    key: string
  ) {
    onRestoringChange(variableId);
    try {
      await restoreVariable({ variableId });
      toast.success(`Restored ${key}`);
    } catch (err) {
      const blocked = getProtectedEnvironmentError(err);
      if (blocked && projectId) {
        toast.error(blocked.message, {
          action: {
            label: "Propose restore",
            onClick: () => {
              void proposeChange({
                projectId,
                kind: "restore",
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
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to restore variable"
        );
      }
    }
    onRestoringChange(null);
  }

  if (!variables || variables.length === 0) return null;

  return (
    <TrashSection icon={KeyRound} title="Variables" count={variables.length}>
      {variables.map((variable) => (
        <div
          key={variable._id}
          className="flex items-center justify-between gap-4 px-6 py-3"
        >
          <div className="min-w-0 flex-1 opacity-60">
            <code className="font-mono text-sm font-semibold line-through text-ink-muted">
              {variable.key}
            </code>
            <SharedPill sharedFrom={variable.sharedFrom} />
            <DeletedTiming deletedAt={variable.deletedAt} now={now} />
          </div>
          <RestoreButton
            restoring={restoringId === variable._id}
            emptying={emptying}
            onClick={() => handleRestoreVariable(variable._id, variable.key)}
          />
        </div>
      ))}
    </TrashSection>
  );
}

function SharedPill({ sharedFrom }: { sharedFrom: string | undefined }) {
  if (!sharedFrom) return null;
  return (
    <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted">
      shared
    </span>
  );
}
