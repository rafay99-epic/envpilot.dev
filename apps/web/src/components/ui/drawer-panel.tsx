"use client";

import { useEffect, useCallback, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: "md" | "lg" | "xl";
  preventClose?: boolean;
  /** Which edge of the screen the panel slides in from. */
  side?: "left" | "right";
}

const widthClasses = {
  md: "w-[420px]",
  lg: "w-[512px]",
  xl: "w-[560px]",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DrawerPanel({
  isOpen,
  onClose,
  title,
  children,
  width = "lg",
  preventClose = false,
  side = "right",
}: DrawerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const safeClose = useCallback(() => {
    if (!preventClose) {
      onClose();
    }
  }, [onClose, preventClose]);

  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        safeClose();
        return;
      }
      // Contain Tab inside the dialog — without this, keyboard users tab
      // straight out of the modal into the inert page behind it.
      if (e.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
          // Nothing focusable inside — keep focus pinned to the panel
          // rather than letting Tab leak to the page behind the modal.
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [safeClose]
  );

  // The keydown listener re-binds whenever its handler identity changes.
  // Cheap and idempotent — nothing here touches focus.
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [isOpen, handleKeydown]);

  /**
   * Focus and scroll lock, keyed on `isOpen` ALONE — deliberately.
   *
   * These two concerns used to share one effect with the keydown binding, so
   * the effect re-ran whenever the handler identity changed, which is
   * whenever the caller passes a fresh `onClose`. Its cleanup restores focus
   * to whatever was focused before the drawer opened, so a drawer that holds
   * its own form state stole focus out of the field on EVERY keystroke: type
   * a few characters, focus jumps to the first focusable in the panel, the
   * rest of the input is dropped on the floor.
   *
   * Drawers whose inputs live in a child component never re-rendered this
   * one, which is why the bug stayed hidden. Splitting the effects fixes it
   * for every caller rather than asking each of them to memoize `onClose`.
   */
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "unset";
      return;
    }
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panelRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "unset";
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50"
            onClick={safeClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: side === "left" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "left" ? "-100%" : "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={`fixed inset-y-0 ${side === "left" ? "left-0" : "right-0"} ${widthClasses[width]} max-w-full`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="flex h-full flex-col bg-white shadow-xl dark:bg-zinc-900">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <h2
                  id="drawer-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  {title}
                </h2>
                <button
                  onClick={safeClose}
                  disabled={preventClose}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
              <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
