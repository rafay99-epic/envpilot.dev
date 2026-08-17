"use client";

import { useState } from "react";
import { useBulkJob } from "@/hooks/useBulkJob";
import type { Id } from "@convex/_generated/dataModel";

const KIND_LABEL = {
  template: "provisioning",
  import: "importing",
  export: "exporting",
} as const;

/** Cells in the meter. Fixed width so the line never reflows as it fills. */
const METER_CELLS = 12;

/**
 * Block-glyph meter, in the same family as the ✓ / ✗ / ↻ glyphs used
 * elsewhere. Fills only once a cell is genuinely earned: a batch at 1/48 must
 * not round up to a lit cell and read as further along than it is.
 */
function meterCells(percent: number): { filled: string; empty: string } {
  const filled = Math.floor((percent / 100) * METER_CELLS);
  return {
    filled: "▓".repeat(filled),
    empty: "░".repeat(METER_CELLS - filled),
  };
}

/**
 * Status line for a pooled vault operation, pinned to the bottom edge of the
 * panel it describes.
 *
 * Sits inside the variables panel rather than above it, which is the whole
 * point of the shape: it never pushes the table down when it appears, and it
 * never leaves a gap when it goes. It also means the confirmation of success
 * is the rows themselves showing up directly above it, so there is no
 * "finished" state to invent — the batch commits in one transaction, the rows
 * appear, the line goes.
 */
export function BulkJobStatusLine({
  projectId,
}: {
  projectId: Id<"projects"> | undefined;
}) {
  const job = useBulkJob(projectId);
  // A failed job stays the newest row for the project until another run
  // replaces it, so without this the line is permanent: the user reads the
  // error, fixes the cause, and the red bar never leaves. Local on purpose —
  // nothing about a dismissal is worth a write.
  const [dismissedId, setDismissedId] = useState<Id<"bulkJobs"> | null>(null);

  if (!job || job.status === "completed") return null;
  if (job._id === dismissedId) return null;

  const isFailed = job.status === "failed";
  const percent =
    job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  const cells = meterCells(percent);

  if (isFailed) {
    return (
      <div
        className="flex items-center gap-3 rounded-b-xl border-t px-4 py-2 font-mono text-[11px] border-danger-line bg-danger-soft"
        role="status"
        aria-live="polite"
      >
        <span className="shrink-0 font-medium text-danger">vault</span>
        <span className="min-w-0 flex-1 truncate text-ink-muted">
          {job.error ?? "the batch could not be completed"}
        </span>
        <span className="shrink-0 tabular-nums text-ink-faint">
          stopped at {job.completed}/{job.total}
        </span>
        <button
          type="button"
          onClick={() => setDismissedId(job._id)}
          className="shrink-0 rounded px-1.5 py-0.5 text-ink-faint underline-offset-2 hover:bg-surface-hover hover:text-ink hover:underline"
        >
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-b-xl border-t px-4 py-2 font-mono text-[11px] border-accent-line bg-accent-soft"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={job.total}
      aria-valuenow={job.completed}
      aria-label={`${KIND_LABEL[job.kind]} variables`}
    >
      <span className="shrink-0 font-medium text-accent">vault</span>
      {/* aria-hidden: the value lives on the progressbar role above, and a
          screen reader reading out "▓▓▓▓░░░░" is noise, not information. */}
      <span aria-hidden="true" className="shrink-0 tracking-tighter">
        <span className="text-accent">{cells.filled}</span>
        <span className="text-ink-faint">{cells.empty}</span>
      </span>
      <span className="shrink-0 tabular-nums text-ink-muted">
        {job.completed}/{job.total}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-faint">
        {KIND_LABEL[job.kind]}
        {job.failed > 0 ? ` · ${job.failed} failed` : ""}
      </span>
      <span className="shrink-0 tabular-nums text-ink-faint">{percent}%</span>
    </div>
  );
}
