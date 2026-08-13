"use client";

import { useEffect } from "react";

/**
 * One save bar per tab, visible only while something is dirty. Replaces the
 * per-card "Save Changes" buttons — a tab saves as a unit or not at all.
 *
 * ⌘S / Ctrl+S is bound while the bar is live, since a keyboard save is the
 * whole point of a persistent bar.
 */
export function SaveBar({
  dirtyCount,
  saving = false,
  error,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
}: {
  dirtyCount: number;
  saving?: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  const live = dirtyCount > 0;

  useEffect(() => {
    if (!live) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, onSave]);

  if (!live) return null;

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-chrome/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:px-0">
      <div className="flex flex-wrap items-center gap-3 sm:px-1">
        {/* The live region is the count alone — wrapping the buttons in it
            makes a screen reader re-announce them on every keystroke. */}
        <span role="status" className="font-mono text-[12px] text-warning">
          ● {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
        </span>
        {error && (
          <span className="font-mono text-[12px] text-danger">{error}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-panel px-4 py-2 text-sm text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-panel bg-accent px-4 py-2 text-sm font-semibold text-chrome transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
