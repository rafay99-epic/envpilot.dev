"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useShareActions } from "@/hooks";
import { Modal } from "@/components/ui";
import { sanitizeConvexError } from "@/lib/error-messages";

export type ScopeTarget = {
  variableId: Id<"environmentVariables">;
  key: string;
  appliesTo: Id<"projects">[] | undefined;
};

interface ScopeDialogProps {
  workspaceId: Id<"projects">;
  target: ScopeTarget | null;
  members: { projectId: Id<"projects">; name: string }[];
  onClose: () => void;
}

/**
 * Which linked projects receive one shared variable.
 *
 * "All" is a rule, not a snapshot: a project joining next month gets the
 * variable. "Only these" is a fixed list and new members do not receive it.
 * The difference is stated on the option rather than left to be discovered
 * three weeks later.
 */
export function ScopeDialog({
  workspaceId,
  target,
  members,
  onClose,
}: ScopeDialogProps) {
  const { setVariableScope } = useShareActions();

  const [mode, setMode] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Set<Id<"projects">>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Sync form state to the row being edited during render, not in an effect.
  // Closing clears it so reopening the same row reloads its saved scope.
  const targetId = target?.variableId ?? null;
  if (targetId !== loadedFor) {
    setLoadedFor(targetId);
    setMode(target?.appliesTo ? "some" : "all");
    setPicked(new Set(target?.appliesTo ?? []));
  }

  async function handleSave() {
    if (!target) return;
    if (mode === "some" && picked.size === 0) {
      toast.error("Pick at least one project, or choose all projects.");
      return;
    }

    setIsSaving(true);
    try {
      await setVariableScope({
        workspaceId,
        variableId: target.variableId,
        // Projects unlinked since the scope was saved are dropped here.
        projectIds:
          mode === "all"
            ? undefined
            : [...picked].filter((id) =>
                members.some((member) => member.projectId === id)
              ),
      });
      toast.success(
        mode === "all"
          ? `${target.key} is read by every linked project.`
          : `${target.key} is read by ${picked.size} of ${members.length}.`
      );
      onClose();
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsSaving(false);
  }

  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      title={`Which projects get ${target?.key ?? ""}?`}
    >
      <div className="space-y-4">
        <div className="divide-y divide-line border border-line">
          <label className="flex items-start gap-3 px-3 py-3">
            <input
              type="radio"
              name="scope-mode"
              checked={mode === "all"}
              onChange={() => setMode("all")}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block font-mono text-xs text-ink">
                All projects in this group
              </span>
              <span className="block font-mono text-[11px] text-ink-muted">
                Keeps following the group. A project added later gets it too.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 px-3 py-3">
            <input
              type="radio"
              name="scope-mode"
              checked={mode === "some"}
              onChange={() => setMode("some")}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block font-mono text-xs text-ink">
                Only the projects I pick
              </span>
              <span className="block font-mono text-[11px] text-ink-muted">
                A fixed list. A project added later does not get it.
              </span>
            </span>
          </label>
        </div>

        {mode === "some" && (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto border border-line">
            {members.map((member) => (
              <li key={member.projectId} className="px-3 py-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={picked.has(member.projectId)}
                    onChange={() =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (next.has(member.projectId))
                          next.delete(member.projectId);
                        else next.add(member.projectId);
                        return next;
                      })
                    }
                    className="accent-accent"
                  />
                  <span className="font-mono text-xs text-ink">
                    {member.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <p className="font-mono text-[11px] text-ink-muted">
          A project that already defines this key cannot be added here. Delete
          its own copy first, or leave it out.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 border border-accent px-3 py-2 font-mono text-xs text-accent disabled:opacity-40"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save scope
          </button>
        </div>
      </div>
    </Modal>
  );
}
