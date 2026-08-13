"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { terminal } from "./tokens";

export function CopyChip({
  text,
  prefix = "$",
  className = "",
}: {
  text: string;
  prefix?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      setCopied(true);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={
        copied ? "Copied to clipboard" : `Copy "${text}" to clipboard`
      }
      aria-live="polite"
      className={`group inline-flex items-center gap-3 rounded-md px-4 py-3 ${terminal.mono} text-[13px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong ${className}`}
    >
      <span aria-hidden className="text-ink-faint">
        {prefix}
      </span>
      {text}
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5 text-ink-faint" />
      )}
    </button>
  );
}
