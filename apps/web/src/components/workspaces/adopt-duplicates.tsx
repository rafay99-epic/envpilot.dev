"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useWorkspaceActions } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

type ScanGroup = {
  key: string;
  environments: string[];
  projectNames: string[];
  adoptable: boolean;
  reason?: string;
};

interface AdoptDuplicatesProps {
  workspaceId: Id<"projects">;
  memberCount: number;
}

/**
 * Pull variables the linked projects already duplicate up into the workspace.
 *
 * This is the path for an account that already has the same credentials
 * copied into six repos. Without it a workspace can only ever hold variables
 * created fresh inside it, because strict inheritance refuses a key the
 * member projects already own.
 *
 * Values are compared on the server and never sent to the browser — the list
 * shows a verdict per key, not a value.
 */
export function AdoptDuplicates({
  workspaceId,
  memberCount,
}: AdoptDuplicatesProps) {
  const { scanDuplicates, adoptKeys } = useWorkspaceActions();

  const [groups, setGroups] = useState<ScanGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isAdopting, setIsAdopting] = useState(false);

  if (memberCount < 2) return null;

  async function handleScan() {
    setIsScanning(true);
    try {
      const result = await scanDuplicates({ workspaceId });
      setGroups(result.groups);
      const adoptableKeys = new Set<string>();
      for (const group of result.groups) {
        if (group.adoptable) adoptableKeys.add(group.key);
      }
      setSelected(adoptableKeys);
      if (result.groups.length === 0) {
        toast.success("No duplicated keys across these projects.");
      }
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsScanning(false);
  }

  async function handleAdopt() {
    setIsAdopting(true);
    try {
      const result = await adoptKeys({
        workspaceId,
        keys: [...selected],
      });
      toast.success(
        `${result.adopted.length} ${result.adopted.length === 1 ? "variable" : "variables"} moved into the workspace.`
      );
      if (result.skipped.length > 0) {
        toast.error(
          `Skipped ${result.skipped.length}: ${result.skipped
            .map((entry) => `${entry.key} (${entry.reason})`)
            .join(", ")}`
        );
      }
      setGroups(null);
      setSelected(new Set());
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsAdopting(false);
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const adoptable = groups?.filter((group) => group.adoptable) ?? [];
  const blocked = groups?.filter((group) => !group.adoptable) ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-mono text-sm text-ink">Already duplicated</h2>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          className="inline-flex items-center gap-2 border border-line px-3 py-1.5 font-mono text-xs text-ink-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {isScanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Find duplicates
        </button>
      </div>

      {groups === null ? (
        <p className="border border-line px-4 py-4 text-sm text-ink-muted">
          If these projects already carry the same variables, scan for them and
          move one copy into the workspace. Every project then reads that one
          row and the copies go to their trash, recoverable for 30 days.
        </p>
      ) : groups.length === 0 ? (
        <p className="border border-line px-4 py-4 text-sm text-ink-muted">
          No key appears in more than one linked project.
        </p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-line border border-line">
            {adoptable.map((group) => (
              <li
                key={group.key}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(group.key)}
                    onChange={() => toggle(group.key)}
                    className="accent-accent"
                  />
                  <span className="font-mono text-sm text-ink">
                    {group.key}
                  </span>
                </label>
                <span className="font-mono text-xs text-ink-muted">
                  {group.environments.join(" ")} · identical in{" "}
                  {group.projectNames.length} projects
                </span>
              </li>
            ))}
            {blocked.map((group) => (
              <li
                key={group.key}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-mono text-sm text-ink-muted">
                  {group.key}
                </span>
                <span className="font-mono text-xs text-danger">
                  {group.reason} · not moved
                </span>
              </li>
            ))}
          </ul>

          {adoptable.length > 0 && (
            <button
              type="button"
              onClick={handleAdopt}
              disabled={isAdopting || selected.size === 0}
              className="inline-flex items-center gap-2 border border-accent px-3 py-2 font-mono text-xs text-accent disabled:opacity-40"
            >
              {isAdopting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Move {selected.size} into the workspace
            </button>
          )}
        </div>
      )}
    </section>
  );
}
