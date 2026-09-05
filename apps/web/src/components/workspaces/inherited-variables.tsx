"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Eye, EyeOff, Loader2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useInheritedVariables } from "@/hooks";
import { useRevealSecret } from "@/hooks/useRevealSecret";
import { sanitizeConvexError } from "@/lib/error-messages";

type InheritedRow = ReturnType<
  typeof useInheritedVariables
>["inherited"][number];

interface InheritedVariablesProps {
  projectId: Id<"projects"> | undefined;
}

/**
 * Variables this project reads from a workspace, grouped by where they come
 * from.
 *
 * Read-only by construction: the row lives in the workspace, so editing it
 * here would be editing someone else's project. Edit and delete are absent
 * rather than disabled, and the group header links to the workspace where
 * they do exist. Revealing works exactly as it does for an owned row, which
 * is the point of sharing.
 */
export function InheritedVariables({ projectId }: InheritedVariablesProps) {
  const { inherited, isLoading } = useInheritedVariables(projectId);
  const revealSecret = useRevealSecret();

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Set<string>>(new Set());

  if (isLoading || inherited.length === 0) return null;

  const byWorkspace = new Map<string, InheritedRow[]>();
  for (const row of inherited) {
    const name = row.workspace?.name ?? "Workspace";
    const group = byWorkspace.get(name);
    if (group) group.push(row);
    else byWorkspace.set(name, [row]);
  }

  async function handleReveal(row: InheritedRow) {
    const id = row._id as string;
    if (revealed[id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }

    setRevealing((current) => new Set(current).add(id));
    try {
      const value = await revealSecret(row.vaultRef);
      setRevealed((current) => ({ ...current, [id]: value }));
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setRevealing((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {[...byWorkspace.entries()].map(([workspaceName, rows]) => (
        <section key={workspaceName} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink-muted">
              <Boxes className="h-3.5 w-3.5" aria-hidden />
              From {workspaceName}
            </h3>
            <span className="font-mono text-xs text-ink-muted">
              {rows.length} {rows.length === 1 ? "variable" : "variables"} ·
              read only
            </span>
          </div>

          <ul className="divide-y divide-line border border-line">
            {rows.map((row) => {
              const id = row._id as string;
              const isRevealing = revealing.has(id);
              const value = revealed[id];

              return (
                <li key={id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-sm text-ink">
                      {row.key}
                    </span>
                    <span className="flex items-center gap-4 font-mono text-xs text-ink-muted">
                      <span>{row.environments.join(" ")}</span>
                      <button
                        type="button"
                        onClick={() => handleReveal(row)}
                        disabled={isRevealing}
                        className="text-ink-muted hover:text-accent disabled:opacity-40"
                        aria-label={
                          value ? `Hide ${row.key}` : `Reveal ${row.key}`
                        }
                      >
                        {isRevealing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : value ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </span>
                  </div>
                  {value && (
                    <p className="mt-2 break-all font-mono text-xs text-ink-muted">
                      {value}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
