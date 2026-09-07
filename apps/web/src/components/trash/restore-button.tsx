import { Loader2, RotateCcw } from "lucide-react";

// The per-row "Restore" button; identical across all four trash sections.
export function RestoreButton({
  restoring,
  emptying,
  onClick,
}: {
  restoring: boolean;
  emptying: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={restoring || emptying}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
    >
      {restoring ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      Restore
    </button>
  );
}
