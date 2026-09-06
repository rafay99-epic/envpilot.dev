"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SettingsSection } from "@envpilot/ui";
import {
  TerminalInput,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { ConfirmDialog } from "@/components/ui";
import { useDuplicateKeysForOrganization, useSharedGroups } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

type SharedGroup = ReturnType<typeof useSharedGroups>["groups"][number];

const PILL =
  "rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted";

export function SharedVariablesTab({
  organizationId,
}: {
  organizationId: Id<"organizations">;
}) {
  const { groups, isLoading } = useSharedGroups(organizationId);
  const duplicates = useDuplicateKeysForOrganization(organizationId);
  // Groups are ordinary projects underneath, so rename and delete are the
  // project mutations — the backend still enforces owner-only removal.
  const renameGroup = useMutation(api.features.projects.mutations.update);
  const removeGroup = useMutation(api.features.projects.mutations.remove);

  const [editingId, setEditingId] = useState<Id<"projects"> | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SharedGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        {groups.length === 0 ? (
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
                {editingId !== group._id && (
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
        <SettingsSection
          title="Duplicated keys"
          description="The same key defined separately in more than one project. Each copy rotates on its own."
        >
          <p className="text-sm text-ink-subtle">
            Share it from any of those projects&rsquo; variables page.
          </p>
          <div className="divide-y divide-line border-t border-line">
            {duplicates.map((duplicate) => (
              <div
                key={duplicate.key}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="truncate font-mono text-sm text-ink">
                  {duplicate.key}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  in {duplicate.projectIds.length} projects
                </span>
              </div>
            ))}
          </div>
        </SettingsSection>
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
    </>
  );
}
