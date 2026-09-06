"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui";
import { useShareActions } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

type ShareActions = ReturnType<typeof useShareActions>;
type Preview = Awaited<ReturnType<ShareActions["preview"]>>;

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: Preview };

type GroupChoice =
  | { kind: "existing"; workspaceId: Id<"projects"> }
  | { kind: "new" };

const HINTS = {
  same: "same value, copy will be adopted",
  absent: "does not have it yet",
  different: "different value, not shared",
} as const;

interface ShareSheetProps {
  projectId: Id<"projects"> | undefined;
  variable: { _id: Id<"environmentVariables">; key: string } | null;
  onClose: () => void;
}

/**
 * Turns one project's variable into a row several projects read. Values are
 * compared on the server; only the verdict reaches the browser.
 */
export function ShareSheet({ projectId, variable, onClose }: ShareSheetProps) {
  const { preview, share } = useShareActions();
  const [state, setState] = useState<Loaded>({ status: "loading" });
  const [picked, setPicked] = useState<Set<Id<"projects">>>(new Set());
  const [group, setGroup] = useState<GroupChoice>({ kind: "new" });
  const [newName, setNewName] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  const variableId = variable?._id;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset during render rather than in the effect: closing and reopening the
  // same row must re-compare, not show verdicts from a minute ago.
  if ((variableId ?? null) !== loadedFor) {
    setLoadedFor(variableId ?? null);
    setState({ status: "loading" });
    setPicked(new Set());
  }

  useEffect(() => {
    if (!projectId || !variableId) return;
    let cancelled = false;
    preview({ projectId, variableId })
      .then((result) => {
        if (cancelled) return;
        const chosen = new Set(
          result.projects
            .filter((project) => project.verdict === "same")
            .map((project) => project._id)
        );
        const best = result.groups
          .map((existing) => ({
            existing,
            hits: existing.memberIds.filter((id) => chosen.has(id)).length,
          }))
          .sort((a, b) => b.hits - a.hits)[0];
        setPicked(chosen);
        setGroup(
          best && best.hits > 0
            ? { kind: "existing", workspaceId: best.existing._id }
            : { kind: "new" }
        );
        setNewName(result.key.split("_")[0].toLowerCase());
        setState({ status: "ready", preview: result });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: sanitizeConvexError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, variableId, preview]);

  async function handleShare() {
    if (!projectId || !variable) return;
    setIsSharing(true);
    try {
      await share({
        projectId,
        variableId: variable._id,
        projectIds: [...picked],
        group:
          group.kind === "existing"
            ? { workspaceId: group.workspaceId }
            : { name: newName.trim() || variable.key.toLowerCase() },
      });
      toast.success(
        `${variable.key} is now read by ${picked.size + 1} projects.`
      );
      onClose();
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsSharing(false);
  }

  const canSubmit =
    state.status === "ready" &&
    picked.size > 0 &&
    (group.kind === "existing" || newName.trim().length > 0);

  return (
    <DrawerPanel
      isOpen={variable !== null}
      onClose={onClose}
      title={`Share ${variable?.key ?? ""}`}
      footer={
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
            onClick={handleShare}
            disabled={!canSubmit || isSharing}
            className="inline-flex items-center gap-2 border border-accent px-3 py-2 text-xs text-accent disabled:opacity-40"
          >
            {isSharing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Share with {picked.size}{" "}
            {picked.size === 1 ? "project" : "projects"}
          </button>
        </div>
      }
    >
      {state.status === "loading" && (
        <p className="text-sm text-ink-muted">Comparing values…</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-danger">{state.message}</p>
      )}

      {state.status === "ready" && (
        <div className="space-y-6">
          <p className="text-sm text-ink-muted">
            One row, read by every project you pick. Change it once and they all
            get it on their next pull.
          </p>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-ink-muted">
              Projects
            </h3>
            <ul className="mt-2 divide-y divide-line border border-line">
              {state.preview.projects.map((project) => {
                const disabled = project.verdict === "different";
                return (
                  <li key={project._id} className="px-3 py-2">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={picked.has(project._id)}
                        onChange={() =>
                          setPicked((current) => {
                            const next = new Set(current);
                            if (next.has(project._id)) next.delete(project._id);
                            else next.add(project._id);
                            return next;
                          })
                        }
                        className="mt-0.5 accent-accent disabled:opacity-40"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">
                          {project.name}
                        </span>
                        <span
                          className={`block text-xs ${disabled ? "text-danger" : "text-ink-muted"}`}
                        >
                          {HINTS[project.verdict]}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-ink-muted">
              Group
            </h3>
            <div className="mt-2 divide-y divide-line border border-line">
              {state.preview.groups.map((existing) => (
                <label
                  key={existing._id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <input
                    type="radio"
                    name="share-group"
                    checked={
                      group.kind === "existing" &&
                      group.workspaceId === existing._id
                    }
                    onChange={() =>
                      setGroup({ kind: "existing", workspaceId: existing._id })
                    }
                    className="accent-accent"
                  />
                  <span className="text-sm text-ink">{existing.name}</span>
                  <span className="text-xs text-ink-muted">
                    {existing.memberIds.length} projects
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-3 px-3 py-2">
                <input
                  type="radio"
                  name="share-group"
                  checked={group.kind === "new"}
                  onChange={() => setGroup({ kind: "new" })}
                  className="accent-accent"
                />
                <span className="text-sm text-ink">New group</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    setGroup({ kind: "new" });
                  }}
                  aria-label="New group name"
                  className="min-w-0 flex-1 border border-line bg-transparent px-2 py-1 text-sm text-ink"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </DrawerPanel>
  );
}
