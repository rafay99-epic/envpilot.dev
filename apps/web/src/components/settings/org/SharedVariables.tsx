"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SettingsRow, SettingsSection } from "@envpilot/ui";
import {
  TerminalInput,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
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

type SharedGroup = ReturnType<typeof useSharedGroups>["groups"][number];

const PILL =
  "rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted";

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

  const [editingId, setEditingId] = useState<Id<"projects"> | null>(null);
  const [draftName, setDraftName] = useState("");
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

  const startRename = (group: SharedGroup) => {
    setEditingId(group._id);
    setDraftName(group.name);
    setError(null);
  };

  const saveRename = async (group: SharedGroup) => {
    const name = draftName.trim();
    if (!name || name === group.name) {
      setEditingId(null);
      return;
    }
    try {
      await renameGroup({ projectId: group._id, name });
      setEditingId(null);
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

        <SettingsRow
          label="Share variables across projects"
          description={
            groups.length === 0
              ? "One row read by several projects. Turning this off stops new sharing."
              : `One row read by several projects. Turning this off stops new sharing; the ${groups.length} ${groups.length === 1 ? "group" : "groups"} you have keep working.`
          }
          control={
            <div className="flex items-center gap-2">
              {!allowed && (
                <span className="text-[12px] text-ink-subtle">
                  Not available on this plan
                </span>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Share variables across projects"
                disabled={!canToggle || !allowed}
                onClick={toggleSharing}
                className={`flex h-5 w-9 items-center border disabled:opacity-40 ${
                  enabled ? "border-accent" : "border-line"
                }`}
              >
                <span
                  className={`block h-3.5 w-3.5 ${
                    enabled
                      ? "translate-x-4 bg-accent"
                      : "translate-x-0.5 bg-ink-subtle"
                  }`}
                />
              </button>
            </div>
          }
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
              <div key={group._id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {editingId === group._id ? (
                    <div className="flex items-center gap-2">
                      <TerminalInput
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        aria-label={`Rename ${group.name}`}
                        className="min-w-40 flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveRename(group);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => saveRename(group)}
                        disabled={!draftName.trim()}
                        title="Save name"
                        className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-ink">
                        {group.name}
                      </span>
                      <span className={PILL}>
                        {group.keys.length} variable
                        {group.keys.length === 1 ? "" : "s"}
                      </span>
                      <span className={PILL}>
                        {group.projects.length} project
                        {group.projects.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  {group.keys.length > 0 && (
                    <p className="truncate font-mono text-xs text-ink-muted">
                      {group.keys.join(", ")}
                    </p>
                  )}
                </div>
                {isOwner && editingId !== group._id && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => startRename(group)}
                      title={`Rename ${group.name}`}
                      className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(group)}
                      title={`Delete ${group.name}`}
                      className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
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
