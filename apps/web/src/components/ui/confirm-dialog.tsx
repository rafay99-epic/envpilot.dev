"use client";

import { useId, useState } from "react";
import { Modal } from "./modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  /**
   * When set, the confirm button stays disabled until the user types this
   * string exactly. Reserved for actions worth slowing down — pass nothing
   * and the dialog behaves as it always has.
   */
  confirmPhrase?: string;
}

// Outline rather than a solid fill. A destructive confirm should be the
// clearest control in the dialog, not the brightest thing on the screen —
// the old solid red button out-shouted every other element in the app.
const variantClasses = {
  danger:
    "border-danger-line text-danger hover:bg-danger-soft focus-visible:outline-danger",
  warning:
    "border-warning-line text-warning hover:bg-warning-soft focus-visible:outline-warning",
  default:
    "border-line-strong text-ink hover:bg-surface-hover focus-visible:outline-line-strong",
};

const headerClasses = {
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
  default: "border-line bg-white/[0.02] text-ink-muted",
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  confirmPhrase,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const fieldId = useId();

  // Reopening must not inherit the last attempt's text, or a second delete
  // would arrive pre-confirmed. Cleared on the way out rather than in an
  // effect watching isOpen: Modal routes Escape and the backdrop through
  // onClose too, so this covers every way the dialog can be dismissed.
  const close = () => {
    setTyped("");
    onClose();
  };

  const phraseSatisfied = !confirmPhrase || typed === confirmPhrase;

  const handleConfirm = async () => {
    if (!phraseSatisfied) return;
    setIsLoading(true);
    try {
      await onConfirm();
      close();
    } catch {
      // Error handling is done by the caller.
    }
    // After the try/catch, not in a `finally`: React Compiler bails on any
    // component whose try carries a finalizer.
    setIsLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={title}
      size="sm"
      variant={variant}
      headerClassName={headerClasses[variant]}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{message}</p>

        {confirmPhrase && (
          <div>
            <label htmlFor={fieldId} className="block text-xs text-ink-subtle">
              Type <span className="font-mono text-ink">{confirmPhrase}</span>{" "}
              to confirm
            </label>
            <input
              id={fieldId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 block w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-faint"
              placeholder={confirmPhrase}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={close}
            disabled={isLoading}
            className="rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 border-line text-ink-muted hover:bg-surface-hover"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !phraseSatisfied}
            className={`rounded-lg border bg-transparent px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]}`}
          >
            {isLoading ? "Working..." : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
