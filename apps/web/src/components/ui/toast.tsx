"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  variant?: "error" | "success" | "warning";
  duration?: number;
}

const variantClasses = {
  error:
    "border-danger-line bg-danger-soft text-danger border-danger-line bg-danger-soft text-danger",
  success:
    "border-accent-line bg-accent-soft text-accent-hover border-accent-line bg-accent-soft text-accent",
  warning:
    "border-warning-line bg-warning-soft text-warning border-warning-line bg-warning-soft text-warning",
};

export function Toast({
  isOpen,
  onClose,
  message,
  variant = "error",
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isOpen, onClose, duration]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <div
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${variantClasses[variant]}`}
      >
        <span>{message}</span>
        <button
          onClick={onClose}
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
