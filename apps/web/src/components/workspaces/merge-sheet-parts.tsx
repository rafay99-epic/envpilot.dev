"use client";

import type { Id } from "@convex/_generated/dataModel";
import { useSharedGroups, type DuplicateGroup } from "@/hooks";

export type MergeResult = {
  workspaceId: Id<"projects"> | null;
  now: string[];
  approval: { key: string; requestId: Id<"changeRequests"> }[];
  held: { key: string; reason: string }[];
};

export type GroupChoice =
  | { kind: "existing"; workspaceId: Id<"projects"> }
  | { kind: "new" };

export type Placed = { group: DuplicateGroup; note: string };

export const PILL =
  "border border-line px-1.5 py-0.5 text-[11px] text-ink-muted";

const REASONS: Record<string, string> = {
  different_values: "different values",
  environment_off: "an environment is off",
  cannot_manage: "you cannot manage one of its projects",
  not_found: "no longer duplicated",
};

export function Bucket({
  title,
  items,
  dropped,
  onToggle,
}: {
  title: string;
  items: Placed[];
  dropped?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-ink-muted">
        {title} · {items.length}
      </h3>
      <ul className="mt-2 divide-y divide-line border border-line">
        {items.map(({ group, note }) => (
          <li key={group.key} className="flex items-start gap-3 px-3 py-2">
            {onToggle && (
              <input
                type="checkbox"
                checked={!dropped?.has(group.key)}
                onChange={() => onToggle(group.key)}
                aria-label={group.key}
                className="mt-1 accent-accent"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm text-ink">
                {group.key}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                {group.environments.map((env) => (
                  <span key={env} className={PILL}>
                    {env}
                  </span>
                ))}
                <span className="text-xs text-ink-muted">
                  {group.projectIds.length} projects
                  {note ? ` · ${note}` : ""}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GroupPicker({
  existing,
  picked,
  name,
  onPick,
  onName,
}: {
  existing: ReturnType<typeof useSharedGroups>["groups"];
  picked: GroupChoice;
  name: string;
  onPick: (choice: GroupChoice) => void;
  onName: (name: string) => void;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-ink-muted">Group</h3>
      <div className="mt-2 divide-y divide-line border border-line">
        {existing.map((group) => (
          <label key={group._id} className="flex items-center gap-3 px-3 py-2">
            <input
              type="radio"
              name="merge-group"
              checked={
                picked.kind === "existing" && picked.workspaceId === group._id
              }
              onChange={() =>
                onPick({ kind: "existing", workspaceId: group._id })
              }
              className="accent-accent"
            />
            <span className="text-sm text-ink">{group.name}</span>
            <span className="text-xs text-ink-muted">
              {group.projects.length} projects
            </span>
          </label>
        ))}
        <div className="flex items-center gap-3 px-3 py-2">
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="merge-group"
              checked={picked.kind === "new"}
              onChange={() => onPick({ kind: "new" })}
              className="accent-accent"
            />
            <span className="text-sm text-ink">New group</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(event) => {
              onName(event.target.value);
              onPick({ kind: "new" });
            }}
            aria-label="New group name"
            className="min-w-0 flex-1 border border-line bg-transparent px-2 py-1 text-sm text-ink"
          />
        </div>
      </div>
    </div>
  );
}

export function ResultView({ result }: { result: MergeResult }) {
  return (
    <div className="space-y-3 text-sm">
      {result.now.length > 0 && (
        <p className="text-ink">
          {result.now.length} keys are now one row each.
        </p>
      )}
      {result.approval.length > 0 && (
        <p className="text-ink">
          {result.approval.length} keys await approval. Their copies stay until
          a second person applies each one.
        </p>
      )}
      {result.held.length > 0 && (
        <p className="text-ink-muted">
          {result.held.length} keys were not touched:{" "}
          {result.held
            .map(
              (item) => `${item.key}: ${REASONS[item.reason] ?? item.reason}`
            )
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}
