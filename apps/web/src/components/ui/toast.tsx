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
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400",
  success:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400",
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
