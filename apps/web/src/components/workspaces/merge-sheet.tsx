"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui";
import { useMergeActions, useSharedGroups, type DuplicateGroup } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

type MergeActions = ReturnType<typeof useMergeActions>;
type MergeResult = Awaited<ReturnType<MergeActions["mergeMany"]>>;

type GroupChoice =
  | { kind: "existing"; workspaceId: Id<"projects"> }
  | { kind: "new" };

type Placed = { group: DuplicateGroup; note: string };

const ENVIRONMENTS = ["development", "staging", "production"] as const;

const REASONS: Record<string, string> = {
  different_values: "different values",
  environment_off: "an environment is off",
  cannot_manage: "you cannot manage one of its projects",
  not_found: "no longer duplicated",
};

const PILL = "border border-line px-1.5 py-0.5 text-[11px] text-ink-muted";

/** Which bucket each duplicated key falls in for the chips that are on. */
function place(groups: DuplicateGroup[], on: Set<string>) {
  const now: Placed[] = [];
  const approval: Placed[] = [];
  const held: Placed[] = [];
  for (const group of groups) {
    const off = group.environments.filter((env) => !on.has(env));
    if (off.length > 0) {
      const verb = off.length === 1 ? "is" : "are";
      held.push({ group, note: `${off.join(", ")} ${verb} off` });
    } else if (group.protectedIn.length > 0) {
      const verb = group.protectedIn.length === 1 ? "protects" : "protect";
      approval.push({
        group,
        note: `${group.protectedIn.join(", ")} ${verb} it`,
      });
    } else {
      now.push({ group, note: "" });
    }
  }
  return { now, approval, held };
}

interface MergeSheetProps {
  organizationId: Id<"organizations"> | undefined;
  groups: DuplicateGroup[] | null;
  onClose: () => void;
}

/**
 * Many keys at once, the same server core the one-row share sheet calls.
 * Chips move keys between buckets; checkboxes only drop a key from the batch.
 */
export function MergeSheet({
  organizationId,
  groups,
  onClose,
}: MergeSheetProps) {
  const { mergeMany } = useMergeActions();
  // Only subscribe while open: the sheet stays mounted behind the banner.
  const { groups: existing } = useSharedGroups(
    groups === null ? undefined : organizationId
  );
  const [on, setOn] = useState(new Set<string>(["development", "staging"]));
  const [dropped, setDropped] = useState(new Set<string>());
  const [choice, setChoice] = useState<GroupChoice | null>(null);
  const [name, setName] = useState("core");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  const list = groups ?? [];
  const signature = list.map((group) => group.key).join(",");
  const [openedFor, setOpenedFor] = useState(signature);
  if (signature !== openedFor) {
    setOpenedFor(signature);
    setResult(null);
    setDropped(new Set());
    setChoice(null);
  }

  const buckets = place(list, on);
  const involved = new Set(list.flatMap((group) => group.projectIds));
  const best = existing
    .map((group) => ({
      group,
      hits: group.projects.filter((project) => involved.has(project._id))
        .length,
    }))
    .sort((a, b) => b.hits - a.hits)[0];
  const picked: GroupChoice =
    choice ??
    (best && best.hits > 0
      ? { kind: "existing", workspaceId: best.group._id }
      : { kind: "new" });

  const selected = (items: Placed[]) =>
    items.filter((item) => !dropped.has(item.group.key));
  const nowCount = selected(buckets.now).length;
  const approvalCount = selected(buckets.approval).length;
  const anyProtected = list.some((group) => group.protectedIn.length > 0);

  const toggleChip = (env: string) =>
    setOn((current) => {
      const next = new Set(current);
      if (!next.delete(env)) next.add(env);
      return next;
    });

  const toggleKey = (key: string) =>
    setDropped((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  async function submit() {
    if (!organizationId) return;
    setBusy(true);
    try {
      setResult(
        await mergeMany({
          organizationId,
          keys: [...selected(buckets.now), ...selected(buckets.approval)].map(
            (item) => ({
              key: item.group.key,
              environments: item.group.environments,
            })
          ),
          environments: [...on],
          group:
            picked.kind === "existing"
              ? { workspaceId: picked.workspaceId }
              : { name: name.trim() || "core" },
        })
      );
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setBusy(false);
  }

  const label = [
    nowCount > 0 ? `Merge ${nowCount} now` : "",
    approvalCount > 0 ? `send ${approvalCount} for approval` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <DrawerPanel
      isOpen={groups !== null}
      onClose={onClose}
      title="Merge identical variables"
      footer={
        result ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="border border-accent px-3 py-2 text-xs text-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-line px-3 py-2 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || nowCount + approvalCount === 0}
              className="inline-flex items-center gap-2 border border-accent px-3 py-2 text-xs text-accent disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {label || "Merge"}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <ResultView result={result} />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-ink-muted">
            Each key becomes one row read by the projects that hold it today.
            Nothing is copied, nothing is re-encrypted.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {ENVIRONMENTS.map((env) => (
              <button
                key={env}
                type="button"
                aria-pressed={on.has(env)}
                onClick={() => toggleChip(env)}
                className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs ${
                  on.has(env)
                    ? "border-accent text-accent"
                    : "border-line text-ink-muted hover:text-ink"
                }`}
              >
                {env === "production" && anyProtected && (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                )}
                {env}
              </button>
            ))}
            {anyProtected && (
              <span className="text-xs text-ink-subtle">needs approval</span>
            )}
          </div>

          <Bucket
            title="Merges now"
            items={buckets.now}
            dropped={dropped}
            onToggle={toggleKey}
          />
          <Bucket
            title="Sent for approval"
            items={buckets.approval}
            dropped={dropped}
            onToggle={toggleKey}
          />
          <Bucket title="Held back" items={buckets.held} />

          <GroupPicker
            existing={existing}
            picked={picked}
            name={name}
            onPick={setChoice}
            onName={setName}
          />
        </div>
      )}
    </DrawerPanel>
  );
}

function Bucket({
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

function GroupPicker({
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

function ResultView({ result }: { result: MergeResult }) {
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
