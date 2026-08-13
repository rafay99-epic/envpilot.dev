"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { DangerRow, SettingsSection } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import {
  TerminalButton,
  TerminalInput,
  TerminalSelect,
} from "@/components/dashboard/terminal-ui";
import {
  useCurrentUserOrganizations,
  useDeleteProject,
  useMoveProject,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import type { Doc } from "@convex/_generated/dataModel";

export function DangerTab({ project }: { project: Doc<"projects"> }) {
  const router = useRouter();
  const { organization } = useAuthContext();
  const deleteProject = useDeleteProject();
  const moveProject = useMoveProject();

  const [error, setError] = useState<string | null>(null);

  const [targetOrgId, setTargetOrgId] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferConfirmText, setTransferConfirmText] = useState("");

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const organizations = useCurrentUserOrganizations(!!organization?.id);
  const userOrgs = (organizations ?? []).filter(
    (org): org is NonNullable<typeof org> =>
      org !== null && org._id !== project.organizationId
  );

  const handleTransfer = async () => {
    if (transferConfirmText !== project.name || !targetOrgId) return;

    setIsTransferring(true);
    setError(null);

    try {
      await moveProject({
        projectId: project._id,
        targetOrganizationId: targetOrgId,
      });

      router.refresh();
      router.push("/dashboard/projects");
    } catch (err) {
      setError(sanitizeConvexError(err));
      setIsTransferring(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== project.name) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteProject(project._id);

      router.replace("/dashboard/projects");
    } catch (err) {
      setError(sanitizeConvexError(err));
      setIsDeleting(false);
    }
  };

  return (
    <SettingsSection
      tone="danger"
      title="Danger zone"
      description="Moving or deleting a project takes every secret in it along."
    >
      {error && <p className="text-[13px] text-danger">{error}</p>}

      <DangerRow
        title="Transfer project"
        description="Move this project and all its environment variables to another organization."
        action={
          <div className="flex flex-col gap-2 sm:w-72">
            {showTransferConfirm && targetOrgId ? (
              <>
                <p className="text-[13px] text-ink-subtle">
                  Type{" "}
                  <span className="font-mono font-semibold text-ink">
                    {project.name}
                  </span>{" "}
                  to confirm transfer.
                </p>
                <TerminalInput
                  type="text"
                  value={transferConfirmText}
                  onChange={(e) => setTransferConfirmText(e.target.value)}
                  placeholder={project.name}
                  aria-label="Project name confirmation for transfer"
                  autoComplete="off"
                />
                <div className="flex gap-2">
                  <TerminalButton
                    variant="secondary"
                    onClick={() => {
                      setShowTransferConfirm(false);
                      setTransferConfirmText("");
                    }}
                  >
                    Cancel
                  </TerminalButton>
                  <TerminalButton
                    variant="danger"
                    onClick={handleTransfer}
                    disabled={
                      transferConfirmText !== project.name || isTransferring
                    }
                  >
                    {isTransferring ? "Transferring..." : "Transfer project"}
                  </TerminalButton>
                </div>
              </>
            ) : (
              <>
                <TerminalSelect
                  className="w-full"
                  aria-label="Target organization"
                  value={targetOrgId}
                  onChange={(e) => setTargetOrgId(e.target.value)}
                >
                  <option value="">Select an organization...</option>
                  {userOrgs.map((org) => (
                    <option key={org._id} value={org._id}>
                      {org.name}
                    </option>
                  ))}
                </TerminalSelect>
                {userOrgs.length === 0 && (
                  <p className="text-xs text-ink-faint">
                    You need to be a member of another organization to transfer.
                  </p>
                )}
                <TerminalButton
                  variant="danger"
                  onClick={() => setShowTransferConfirm(true)}
                  disabled={!targetOrgId}
                >
                  Transfer project
                </TerminalButton>
              </>
            )}
          </div>
        }
      />

      <DangerRow
        title="Delete project permanently"
        description="This immediately removes access and permanently queues every environment variable, version, account, secret file, document, share, member assignment, and project-specific setting for deletion. This cannot be undone."
        action={
          <div className="flex flex-col gap-2 sm:w-72" aria-busy={isDeleting}>
            {showDeleteConfirm ? (
              <>
                <p className="text-[13px] text-ink-subtle">
                  Type{" "}
                  <span className="font-mono font-semibold text-ink">
                    {project.name}
                  </span>{" "}
                  exactly to continue.
                </p>
                <TerminalInput
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={project.name}
                  aria-label="Project name confirmation"
                  autoComplete="off"
                  disabled={isDeleting}
                />
                {isDeleting && (
                  <div
                    className="flex items-center gap-2 text-[13px] text-danger"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Securing deletion and removing project access…
                  </div>
                )}
                <div className="flex gap-2">
                  <TerminalButton
                    variant="secondary"
                    disabled={isDeleting}
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText("");
                    }}
                  >
                    Cancel
                  </TerminalButton>
                  <TerminalButton
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isDeleting || deleteConfirmText !== project.name}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Deleting project…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete permanently
                      </>
                    )}
                  </TerminalButton>
                </div>
              </>
            ) : (
              <TerminalButton
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete project
              </TerminalButton>
            )}
          </div>
        }
      />
    </SettingsSection>
  );
}
