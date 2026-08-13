"use client";

interface DocStatusPillProps {
  status: "draft" | "published";
}

/** Publication state, as a pill beside the title. Was a full-width banner —
 *  a row of chrome above the writing surface restating one boolean. */
export function DocStatusPill({ status }: DocStatusPillProps) {
  const isDraft = status === "draft";
  return (
    <span
      data-testid="doc-review-bar"
      data-status={status}
      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
        isDraft
          ? "border-warning-line bg-warning-soft text-warning"
          : "border-accent-line bg-accent-soft text-accent"
      }`}
    >
      {isDraft ? "draft" : "published"}
    </span>
  );
}
