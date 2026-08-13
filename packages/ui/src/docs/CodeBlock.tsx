"use client";

import { useState, useRef, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Terminal-style code block frame matching the marketing TerminalFrame:
 *
 *   - rounded-xl bordered window with macOS traffic lights
 *   - Language label in the title bar (bash/sh → "terminal")
 *   - Copy-to-clipboard button with success feedback
 *
 * The rehype-pretty-code <pre> renders inside; its line/token styling
 * comes from globals.css (#0f172a terminal background).
 */
export function CodeBlock({
  children,
  language,
}: {
  children: ReactNode;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLDivElement>(null);

  function handleCopy() {
    // Extract plain text from the rendered code
    const text = preRef.current?.querySelector("pre")?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const title =
    language === "bash" || language === "sh" ? "terminal" : language;

  return (
    <div
      ref={preRef}
      className="group mb-6 overflow-hidden rounded-xl border border-line shadow-lg transition-colors hover:border-accent-line"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-line bg-surface/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-danger-soft" />
            <span className="h-3 w-3 rounded-full bg-warning-soft" />
            <span className="h-3 w-3 rounded-full bg-accent-soft" />
          </div>

          {title && (
            <span className="font-mono text-xs text-ink-subtle">
              <span className="mr-1.5 text-accent/70">❯</span>
              {title}
            </span>
          )}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-ink-subtle transition-colors hover:bg-surface-hover/80 hover:text-ink-muted"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" />
              <span className="text-accent">copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content — the <pre> from rehype-pretty-code is rendered inside */}
      {children}
    </div>
  );
}
