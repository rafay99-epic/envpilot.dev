"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useBulkJob } from "@/hooks/useBulkJob";
import type { Id } from "@convex/_generated/dataModel";

const KIND_LABEL = {
  template: "Provisioning variables",
  import: "Importing variables",
  export: "Exporting variables",
} as const;

/**
 * Live progress for a pooled vault operation.
 *
 * Determinate only: the bar moves when a variable actually lands in the vault
 * and never otherwise. No pulse, shimmer or spinner, which peg the GPU on a
 * high-refresh display for the entire run and say nothing true anyway.
 *
 * Rows appear all at once when the batch commits, because persistence is one
 * transaction. The label says "writing to vault" rather than implying the list
 * is filling in, so the UI never claims a half-populated state the backend
 * cannot be in.
 */
export function BulkJobProgress({
  projectId,
}: {
  projectId: Id<"projects"> | undefined;
}) {
  const job = useBulkJob(projectId);
  // A failed job is the newest row for the project until another run replaces
  // it, so without this the banner is permanent: the user reads the error,
  // fixes the cause by hand, and the red block stays on the page forever.
  // Dismissal is local on purpose — nothing about it is worth a write.
  const [dismissedId, setDismissedId] = useState<Id<"bulkJobs"> | null>(null);

  if (!job || job.status === "completed") return null;
  if (job._id === dismissedId) return null;

  const isFailed = job.status === "failed";
  const percent =
    job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;

  return (
    <div
      className="rounded-lg border p-4 border-line bg-surface"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-ink">
          {isFailed ? "Provisioning failed" : KIND_LABEL[job.kind]}
        </p>
        {isFailed ? (
          <button
            type="button"
            onClick={() => setDismissedId(job._id)}
            aria-label="Dismiss"
            className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <p className="font-mono text-xs tabular-nums text-ink-muted">
            {job.completed} / {job.total}
          </p>
        )}
      </div>

      {isFailed ? (
        <p className="mt-2 text-sm text-danger">
          {job.error ?? "The batch could not be completed."}
        </p>
      ) : (
        <>
          <div
            className="mt-3 h-0.5 w-full overflow-hidden bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={job.total}
            aria-valuenow={job.completed}
            aria-label={KIND_LABEL[job.kind]}
          >
            <div
              className="h-full bg-ink transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-subtle">
            writing to vault
            {job.failed > 0 ? ` · ${job.failed} failed` : ""}
          </p>
        </>
      )}
    </div>
  );
}
