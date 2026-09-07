"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui";
import { useMergeActions, useSharedGroups, type DuplicateGroup } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  Bucket,
  GroupPicker,
  ResultView,
  type GroupChoice,
  type MergeResult,
  type Placed,
} from "./merge-sheet-parts";

const ENVIRONMENTS = ["development", "staging", "production"] as const;

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
