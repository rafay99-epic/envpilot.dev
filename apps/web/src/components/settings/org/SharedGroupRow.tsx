"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { SettingsRow } from "@envpilot/ui";
import { TerminalInput } from "@/components/dashboard/terminal-ui";
import type { useSharedGroups } from "@/hooks";

export type SharedGroup = ReturnType<typeof useSharedGroups>["groups"][number];

export const PILL =
  "rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted";

export function SharingSwitch({
  groupCount,
  allowed,
  enabled,
  canToggle,
  onToggle,
}: {
  groupCount: number;
  allowed: boolean;
  enabled: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const kept =
    groupCount === 0
      ? ""
      : `; the ${groupCount} ${groupCount === 1 ? "group" : "groups"} you have keep working`;
  return (
    <SettingsRow
      label="Share variables across projects"
      description={`One row read by several projects. Turning this off stops new sharing${kept}.`}
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
            onClick={onToggle}
            className={`flex h-5 w-9 items-center border disabled:opacity-40 ${enabled ? "border-accent" : "border-line"}`}
          >
            <span
              className={`block h-3.5 w-3.5 ${enabled ? "translate-x-4 bg-accent" : "translate-x-0.5 bg-ink-subtle"}`}
            />
          </button>
        </div>
      }
    />
  );
}

export function GroupRow({
  group,
  canManage,
  onRename,
  onDelete,
}: {
  group: SharedGroup;
  canManage: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  async function save() {
    const name = draft?.trim() ?? "";
    if (name && name !== group.name) await onRename(name);
    setDraft(null);
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        {draft === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-ink">
              {group.name}
            </span>
            <span className={PILL}>
              {group.keys.length} variable{group.keys.length === 1 ? "" : "s"}
            </span>
            <span className={PILL}>
              {group.projects.length} project
              {group.projects.length === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <TerminalInput
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Rename ${group.name}`}
              className="min-w-40 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") setDraft(null);
              }}
              autoFocus
            />
            <button
              onClick={save}
              disabled={!draft.trim()}
              title="Save name"
              className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDraft(null)}
              title="Cancel"
              className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {group.keys.length > 0 && (
          <p className="truncate font-mono text-xs text-ink-muted">
            {group.keys.join(", ")}
          </p>
        )}
      </div>
      {canManage && draft === null && (
        <div className="flex gap-1">
          <button
            onClick={() => setDraft(group.name)}
            title={`Rename ${group.name}`}
            className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            title={`Delete ${group.name}`}
            className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
