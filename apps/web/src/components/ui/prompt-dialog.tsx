"use client";

import { useEffect, useRef } from "react";
import { Modal } from "./modal";

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message: string;
  placeholder?: string;
  submitText?: string;
  cancelText?: string;
  inputType?: string;
}

export function PromptDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder = "",
  submitText = "Submit",
  cancelText = "Cancel",
  inputType = "text",
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = inputRef.current?.value?.trim();
    if (value) {
      onSubmit(value);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-muted">{message}</p>
        <input
          ref={inputRef}
          type={inputType}
          placeholder={placeholder}
          required
          className="mt-3 block w-full rounded-lg border px-4 py-2.5 placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink"
        />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line text-ink-muted hover:bg-surface-hover"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-ink px-4 py-2 text-sm font-medium transition-colors text-ink-inverse hover:bg-ink-muted"
          >
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
