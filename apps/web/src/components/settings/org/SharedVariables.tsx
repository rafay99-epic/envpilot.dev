"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SettingsSection } from "@envpilot/ui";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { ConfirmDialog } from "@/components/ui";
import { MergeSheet } from "@/components/workspaces";
import {
  useDuplicateKeysForOrganization,
  useMergeActions,
  useSharedGroups,
  useSharingStatus,
  type DuplicateGroup,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  GroupRow,
  PILL,
  SharingSwitch,
  type SharedGroup,
} from "./SharedGroupRow";

export function SharedVariablesTab({
  organizationId,
  isOwner,
}: {
  organizationId: Id<"organizations">;
  isOwner: boolean;
}) {
  const { groups, isLoading } = useSharedGroups(organizationId);
  const { allowed, enabled, canToggle } = useSharingStatus(organizationId);
  const { setSharingEnabled } = useMergeActions();
  const duplicates = useDuplicateKeysForOrganization(
    enabled ? organizationId : undefined
  );
  // Groups are ordinary projects underneath, so rename and delete are the
  // project mutations — the backend still enforces owner-only removal.
  const renameGroup = useMutation(api.features.projects.mutations.update);
  const removeGroup = useMutation(api.features.projects.mutations.remove);

  const [pendingDelete, setPendingDelete] = useState<SharedGroup | null>(null);
  const [merging, setMerging] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSharing = async () => {
    try {
      await setSharingEnabled({ organizationId, enabled: !enabled });
    } catch (err) {
      setError(sanitizeConvexError(err));
    }
  };

  const rename = async (group: SharedGroup, name: string) => {
    try {
      await renameGroup({ projectId: group._id, name });
    } catch (err) {
      setError(sanitizeConvexError(err));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await removeGroup({ projectId: pendingDelete._id });
      setPendingDelete(null);
    } catch (err) {
      setError(sanitizeConvexError(err));
      throw err;
    }
  };

  if (isLoading) return <TerminalLoading />;

  return (
    <>
      <SettingsSection
        title="Shared variables"
        description="Groups of variables that several projects read. An edit in one group reaches every project linked to it."
      >
        {error && <p className="font-mono text-[12px] text-danger">{error}</p>}

        <SharingSwitch
          groupCount={groups.length}
          allowed={allowed}
          enabled={enabled}
          canToggle={canToggle}
          onToggle={toggleSharing}
        />

        {!enabled && (
          <p className="text-sm text-ink-subtle">
            Sharing is off.{" "}
            {groups.length > 0
              ? `${groups.length} ${groups.length === 1 ? "group keeps" : "groups keep"} working; `
              : ""}
            nothing new can be shared until it is on.
          </p>
        )}

        {!enabled ? null : groups.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            Nothing shared yet. Share a variable from a project&rsquo;s
            variables page.
          </p>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {groups.map((group) => (
              <GroupRow
                key={group._id}
                group={group}
                canManage={isOwner}
                onRename={(name) => rename(group, name)}
                onDelete={() => setPendingDelete(group)}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      {duplicates.length > 0 && (
        <Identical duplicates={duplicates} onMerge={setMerging} />
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete group"
        message={`The ${pendingDelete?.projects.length ?? 0} projects reading these ${pendingDelete?.keys.length ?? 0} variables lose them on their next pull.`}
        confirmText="Delete group"
        variant="danger"
        confirmPhrase={pendingDelete?.name}
      />

      <MergeSheet
        organizationId={organizationId}
        groups={merging}
        onClose={() => setMerging(null)}
      />
    </>
  );
}

/** Keys several projects hold separately, with the merge entry points. */
function Identical({
  duplicates,
  onMerge,
}: {
  duplicates: DuplicateGroup[];
  onMerge: (groups: DuplicateGroup[]) => void;
}) {
  const projectCount = new Set(duplicates.flatMap((row) => row.projectIds))
    .size;
  return (
    <SettingsSection
      title="Identical across projects"
      description={`${duplicates.length} keys · ${projectCount} projects`}
      aside={
        <button
          type="button"
          onClick={() => onMerge(duplicates)}
          className="border border-accent px-2.5 py-1 text-xs text-accent"
        >
          Merge all
        </button>
      }
    >
      <div className="divide-y divide-line border-t border-line">
        {duplicates.map((duplicate) => (
          <div
            key={duplicate.key}
            className="flex items-center gap-3 py-2.5 text-xs"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm text-ink">
                {duplicate.key}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                {duplicate.environments.map((env) => (
                  <span key={env} className={PILL}>
                    {env}
                  </span>
                ))}
                <span className="text-ink-muted">
                  {duplicate.projectIds.length} projects
                  {duplicate.verified ? "" : " · compared on merge"}
                </span>
                {duplicate.protectedIn.length > 0 && (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">
                    protected in {duplicate.protectedIn.join(", ")}
                  </span>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onMerge([duplicate])}
              className="shrink-0 border border-line px-2.5 py-1 text-ink-muted hover:text-ink"
            >
              Merge
            </button>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
