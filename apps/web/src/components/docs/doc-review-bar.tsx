"use client";

interface DocStatusPillProps {
  status: "draft" | "published";
}

/**
 * Publication state, as a pill beside the title.
 *
 * This used to be a full-width banner with an icon, a heading, a paragraph
 * and its own Publish button — a whole row of chrome above the writing
 * surface restating one boolean. The state still matters (a draft is
 * invisible to teammates and returned by no MCP read), but the place to say
 * so is next to the title, with the consequence spelled out once underneath
 * and the action living with the page's other actions.
 */
export function DocStatusPill({ status }: DocStatusPillProps) {
  const isDraft = status === "draft";
  return (
    <span
      data-testid="doc-review-bar"
      data-status={status}
      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
        isDraft
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-green-500/40 bg-green-500/10 text-green-400"
      }`}
    >
      {isDraft ? "draft" : "published"}
    </span>
  );
}
