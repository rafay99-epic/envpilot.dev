"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Safe to check directly rather than tracking a mounted flag in state: these
 * only ever render once `isOpen` flips, which is a user interaction and so
 * always client-side. Server and client both render null on first paint, so
 * there is no hydration mismatch and no effect needed.
 */
const canPortal = () => typeof document !== "undefined";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "danger" | "warning" | "default";
  /** Overrides the header chrome so severity can live in the frame. */
  headerClassName?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  variant = "default",
  headerClassName,
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen || !canPortal()) return null;

  // Portalled to <body>, and that is load-bearing rather than tidiness.
  // The dashboard sidebar is `relative z-20` and <main> is `relative z-10`,
  // so a dialog rendered inside the page is confined to main's stacking
  // context: its z-50 competes only with main's other children, and the
  // whole subtree — backdrop included — paints UNDER the sidebar. That is
  // why the background dimmed but the sidebar stayed lit.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative w-full ${sizeClasses[size]} transform overflow-hidden rounded-xl border shadow-xl transition-all bg-surface ${
            variant === "danger"
              ? "border-danger-line"
              : variant === "warning"
                ? "border-warning-line"
                : "border-line"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header. Mono and compact, matching TerminalWindow's chrome
              rather than the large centered heading dialogs used to carry. */}
          <div
            className={`flex items-center justify-between border-b px-4 py-2.5 ${headerClassName ?? "border-line bg-white/[0.02] text-ink-muted"}`}
          >
            <h2 className="font-mono text-[11.5px] lowercase tracking-wide">
              {title}
            </h2>
            {/* Named "Close" rather than `Close ${title}`: the dialog already
                carries the title via aria-label, and some titles interpolate
                user data. */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
