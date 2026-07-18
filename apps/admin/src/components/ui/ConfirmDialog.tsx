import { useEffect, useRef } from "react";
import { useConfirmStore } from "@/stores/confirm-store";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANT_STYLES = {
  danger: {
    icon: <Trash2 className="h-5 w-5 text-red-400" />,
    iconBg: "bg-red-500/10 border-red-500/20",
    confirmBtn:
      "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    iconBg: "bg-amber-500/10 border-amber-500/20",
    confirmBtn:
      "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  },
  default: {
    icon: <Info className="h-5 w-5 text-blue-400" />,
    iconBg: "bg-blue-500/10 border-blue-500/20",
    confirmBtn:
      "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20",
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
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl">
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
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-zinc-700/50 px-6 py-4">
          <button
            onClick={() => onCancel?.()}
            className="rounded-lg border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
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
