"use client";

import { useState } from "react";
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      className={`group inline-flex items-center gap-3 rounded-md px-4 py-3 ${terminal.mono} text-[13px] text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:text-zinc-100 hover:ring-white/20 ${className}`}
    >
      <span aria-hidden className="text-zinc-600">
        {prefix}
      </span>
      {text}
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5 text-zinc-600" />
      )}
    </button>
  );
}
