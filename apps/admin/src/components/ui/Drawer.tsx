import { useEffect, useRef, useState, useCallback } from "react";
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
        requestAnimationFrame(() => setEntering(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setEntering(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
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
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          width,
          entering ? "translate-x-0" : "translate-x-full",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
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
