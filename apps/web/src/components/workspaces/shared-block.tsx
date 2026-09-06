"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import {
  useSharedGroupBySlug,
  useSharedRows,
  useShareActions,
  type SharedRow,
} from "@/hooks";
import { Modal } from "@/components/ui";
import { VariableListItem } from "@/components/variables/variable-list-item";
import { sanitizeConvexError } from "@/lib/error-messages";
import { ScopeDialog, type ScopeTarget } from "./scope-dialog";

interface SharedBlockProps {
  projectId: Id<"projects"> | undefined;
  projectName: string;
  /** project.workspaces.manage — the same flag the share mutations check. */
  canManage: boolean;
  revealedValues: Record<string, string>;
  revealingIds: Set<string>;
  onReveal: (row: SharedRow) => void;
  onEdit: (row: SharedRow) => void;
  onDelete: (row: SharedRow) => void;
}

/**
 * Rows this project reads from other projects, pinned above its own table so
 * a value it depends on is never below the fold.
 */
export function SharedBlock({ projectId, ...rest }: SharedBlockProps) {
  const { rows } = useSharedRows(projectId);
  if (rows.length === 0) return null;

  const groups = new Map<Id<"projects">, SharedRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.workspace._id);
    if (existing) existing.push(row);
    else groups.set(row.workspace._id, [row]);
  }

  return (
    <div className="divide-y divide-line border-b border-line">
      {[...groups.values()].map((groupRows) => (
        <SharedGroup
          key={groupRows[0].workspace._id}
          projectId={projectId}
          rows={groupRows}
          {...rest}
        />
      ))}
    </div>
  );
}

function SharedGroup({
  projectId,
  projectName,
  canManage,
  rows,
  revealedValues,
  revealingIds,
  onReveal,
  onEdit,
  onDelete,
}: Omit<SharedBlockProps, "projectId"> & {
  projectId: Id<"projects"> | undefined;
  rows: SharedRow[];
}) {
  const { organization } = useAuthContext();
  const { unshare } = useShareActions();
  const [scopeTarget, setScopeTarget] = useState<ScopeTarget | null>(null);
  const [stopping, setStopping] = useState(false);
  const [keepCopies, setKeepCopies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const group = rows[0].workspace;
  const readers = new Set(rows.flatMap((row) => row.reached));

  // Only fetched while the scope dialog is open: the picker needs project ids
  // and the row itself carries names.
  const detail = useSharedGroupBySlug(
    organization?.id as Id<"organizations"> | undefined,
    scopeTarget ? group.slug : undefined
  );

  async function handleStopSharing() {
    if (!projectId) return;
    setIsSaving(true);
    try {
      const result = await unshare({
        workspaceId: group._id,
        projectId,
        keepCopies,
      });
      if (result.failed.length > 0) {
        toast.warning(
          `Stopped sharing. Could not copy ${result.failed.map((entry) => entry.key).join(", ")}.`
        );
      } else {
        toast.success(`${projectName} no longer reads ${group.name}.`);
      }
      setStopping(false);
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsSaving(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted">
            shared
          </span>
          <Link
            href={`/organizations/${organization?.slug ?? ""}/settings?tab=shared`}
            className="text-sm font-semibold text-ink hover:text-ink-muted"
          >
            {group.name}
          </Link>
          <span className="text-xs text-ink-muted">
            {rows.length} {rows.length === 1 ? "variable" : "variables"} read by{" "}
            {readers.size} {readers.size === 1 ? "project" : "projects"}
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setStopping(true)}
            className="text-xs text-ink-muted hover:text-ink"
          >
            stop sharing here
          </button>
        )}
      </div>

      <div className="divide-y divide-line">
        {rows.map((row) => {
          const reach = `${row.reached.length} ${row.reached.length === 1 ? "project" : "projects"}`;
          return (
            <VariableListItem
              key={row._id}
              variable={row}
              badge={
                <>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() =>
                        setScopeTarget({
                          variableId: row._id,
                          key: row.key,
                          appliesTo: row.appliesTo,
                        })
                      }
                      aria-label={`Which projects get ${row.key}`}
                      title="Which projects get this"
                      className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted hover:text-ink"
                    >
                      {reach}
                    </button>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted">
                      {reach}
                    </span>
                  )}
                  {row.protectedIn.length > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                      protected in {row.protectedIn.join(", ")}
                    </span>
                  )}
                </>
              }
              onReveal={() => onReveal(row)}
              revealedValue={revealedValues[row._id] ?? null}
              isRevealing={revealingIds.has(row._id)}
              canEdit={row.canEdit}
              canDelete={row.canEdit}
              readOnlyLabel={row.canEdit ? undefined : "read only"}
              onEdit={() => onEdit(row)}
              onDelete={() => onDelete(row)}
            />
          );
        })}
      </div>

      <ScopeDialog
        workspaceId={group._id}
        target={scopeTarget}
        members={(detail?.projects ?? []).map((project) => ({
          projectId: project._id,
          name: project.name,
        }))}
        onClose={() => setScopeTarget(null)}
      />

      <Modal
        isOpen={stopping}
        onClose={() => setStopping(false)}
        title={`Stop sharing in ${projectName}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {projectName} stops reading {rows.length}{" "}
            {rows.length === 1 ? "variable" : "variables"} from {group.name}.
            Every other project keeps them.
          </p>
          <label className="flex items-start gap-3 border border-line px-3 py-3">
            <input
              type="checkbox"
              checked={keepCopies}
              onChange={() => setKeepCopies((current) => !current)}
              className="mt-0.5 accent-accent"
            />
            <span className="text-sm text-ink">
              Keep a private copy of the current values in {projectName}
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStopping(false)}
              className="border border-line px-3 py-2 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStopSharing}
              disabled={isSaving}
              className="inline-flex items-center gap-2 border border-danger-line px-3 py-2 text-xs text-danger disabled:opacity-40"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Stop sharing
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
