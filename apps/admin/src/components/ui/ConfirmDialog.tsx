import { useEffect, useRef } from "react";
import { useConfirmStore } from "@/stores/confirm-store";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANT_STYLES = {
  danger: {
    icon: <Trash2 className="h-5 w-5 text-danger" />,
    iconBg: "bg-danger-soft border-danger-line",
    confirmBtn:
      "border-danger-line bg-danger-soft text-danger hover:bg-danger-soft",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-warning" />,
    iconBg: "bg-warning-soft border-warning-line",
    confirmBtn:
      "border-warning-line bg-warning-soft text-warning hover:bg-warning-soft",
  },
  default: {
    icon: <Info className="h-5 w-5 text-info" />,
    iconBg: "bg-info-soft border-info-line",
    confirmBtn:
      "border-accent-line bg-accent-soft text-accent hover:bg-accent-soft",
  },
};

export function ConfirmDialog() {
  const {
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    variant,
    onConfirm,
    onCancel,
    close,
  } = useConfirmStore();

  const overlayRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus the cancel/confirm button when dialog opens
    requestAnimationFrame(() => confirmBtnRef.current?.focus());

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const styles = VARIANT_STYLES[variant];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-lg border border-line bg-surface/90 shadow-2xl">
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border",
                styles.iconBg
              )}
            >
              {styles.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button
            onClick={() => onCancel?.()}
            className="rounded-lg border border-line bg-transparent px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink-muted"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => onConfirm?.()}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              styles.confirmBtn
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
