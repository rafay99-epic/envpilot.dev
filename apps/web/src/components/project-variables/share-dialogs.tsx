"use client";

import type { Id } from "@convex/_generated/dataModel";
import { ShareSecretDrawer } from "@/components/variables";
import { SharedRowDialogs, ShareSheet } from "@/components/workspaces";
import { useRevealSecret } from "@/hooks/useRevealSecret";
import type { SharedRow } from "@/hooks";
import type { Variable } from "./types";

// Every sharing surface for this project: shared-row edit/delete, the
// cross-project share sheet, and the one-off secret share drawer.
export function ShareDialogs({
  editingShared,
  deletingShared,
  onCloseShared,
  sharingAcross,
  onCloseSharingAcross,
  sharingVariable,
  onCloseSharingVariable,
  projectId,
  organizationId,
  showRotation,
}: {
  editingShared: SharedRow | null;
  deletingShared: SharedRow | null;
  onCloseShared: () => void;
  sharingAcross: Variable | null;
  onCloseSharingAcross: () => void;
  sharingVariable: Variable | null;
  onCloseSharingVariable: () => void;
  projectId: Id<"projects"> | undefined;
  organizationId: Id<"organizations"> | undefined;
  showRotation: boolean;
}) {
  const revealSecret = useRevealSecret();

  return (
    <>
      <SharedRowDialogs
        editing={editingShared}
        deleting={deletingShared}
        showRotation={showRotation}
        onClose={onCloseShared}
      />

      <ShareSheet
        projectId={projectId}
        variable={sharingAcross}
        onClose={onCloseSharingAcross}
      />

      {sharingVariable && projectId && organizationId && (
        <ShareSecretDrawer
          isOpen={!!sharingVariable}
          onClose={onCloseSharingVariable}
          variable={sharingVariable}
          organizationId={organizationId}
          projectId={projectId}
          onRevealValue={async () => {
            if (!sharingVariable.vaultRef) return null;
            try {
              return await revealSecret(sharingVariable.vaultRef);
            } catch {
              return null;
            }
          }}
        />
      )}
    </>
  );
}
