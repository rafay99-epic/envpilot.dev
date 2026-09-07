"use client";

import { useMutation } from "convex/react";
import { toast } from "sonner";
import { FileKey } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { fileProposal } from "@/components/changes";
import { getProtectedEnvironmentError } from "@/lib/error-messages";
import { DeletedTiming } from "./deleted-timing";
import { RestoreButton } from "./restore-button";
import { TrashSection } from "./trash-section";
import type { DeletedFile, TrashSectionProps } from "./trash-items";

export function TrashFilesSection({
  files,
  projectId,
  now,
  restoringId,
  onRestoringChange,
  emptying,
}: TrashSectionProps & { files: DeletedFile[] | undefined }) {
  const restoreFile = useMutation(api.features.files.mutations.restore);
  const createChangeRequest = useMutation(
    api.features.changeRequests.mutations.create
  );

  async function handleRestoreFile(file: {
    _id: Id<"projectFiles">;
    name: string;
    path: string;
    environments: string[];
  }) {
    onRestoringChange(file._id);
    try {
      await restoreFile({ fileId: file._id });
      toast.success(`Restored ${file.name}`);
    } catch (err) {
      const blocked = getProtectedEnvironmentError(err);
      if (blocked && projectId) {
        toast.error(blocked.message, {
          action: {
            label: "Propose restore",
            onClick: () => {
              void fileProposal(createChangeRequest, {
                projectId,
                resourceType: "file",
                kind: "restore",
                targetId: file._id,
                environments: file.environments,
                payload: "{}",
                label: file.path,
                source: "web",
              });
            },
          },
        });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to restore file"
        );
      }
    }
    onRestoringChange(null);
  }

  if (!files || files.length === 0) return null;

  return (
    <TrashSection icon={FileKey} title="Secret files" count={files.length}>
      {files.map((file) => (
        <div
          key={file._id}
          className="flex items-center justify-between gap-4 px-6 py-3"
        >
          <div className="min-w-0 flex-1 opacity-60">
            <span className="text-sm font-semibold line-through text-ink-muted">
              {file.name}
            </span>
            <p className="truncate font-mono text-xs text-ink-subtle">
              {file.path}
            </p>
            <DeletedTiming deletedAt={file.deletedAt} now={now} />
          </div>
          <RestoreButton
            restoring={restoringId === file._id}
            emptying={emptying}
            onClick={() => handleRestoreFile(file)}
          />
        </div>
      ))}
    </TrashSection>
  );
}
