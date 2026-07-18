import { useEffect, useId, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  width?: string;
  /** Called before closing — return false to prevent close (e.g. unsaved changes) */
  onBeforeClose?: () => boolean | Promise<boolean>;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  width = "max-w-md",
  onBeforeClose,
}: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entering, setEntering] = useState(false);

  const handleClose = useCallback(async () => {
    if (onBeforeClose) {
      const allowed = await onBeforeClose();
      if (!allowed) return;
    }
    onClose();
  }, [onClose, onBeforeClose]);

  // Mount → animate in, animate out → unmount
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Force a layout flush before applying the enter class
      const raf = requestAnimationFrame(() => {
        // Second rAF ensures the browser has painted the initial (off-screen) state
        requestAnimationFrame(() => {
          setEntering(true);
          const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
          (first ?? panelRef.current)?.focus();
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setEntering(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key, Tab focus trap & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-50 transition-all duration-300 ease-out",
        entering
          ? "bg-black/40 backdrop-blur-[2px]"
          : "pointer-events-none bg-transparent"
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) handleClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col border-l border-zinc-700/50 bg-zinc-900 shadow-2xl focus:outline-none",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          width,
          entering ? "translate-x-0" : "translate-x-full",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-700/50 px-6 py-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-green-500/5 hover:text-green-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
