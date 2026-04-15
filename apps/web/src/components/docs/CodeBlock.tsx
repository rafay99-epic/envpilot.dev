"use client";

import { useState, useRef, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Terminal-style code block wrapper that matches the landing page.
 *
 * Features:
 *   - macOS traffic light dots (red, yellow, green)
 *   - Language label in the title bar
 *   - Copy-to-clipboard button with success feedback
 *   - #0f172a background (--terminal-bg)
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
      className="group mb-6 overflow-hidden rounded-lg border border-zinc-700/50 shadow-lg"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-zinc-700/30 bg-zinc-800/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>

          {title && (
            <span className="font-mono text-xs text-zinc-500">{title}</span>
          )}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content — the <pre> from rehype-pretty-code is rendered inside */}
      {children}
    </div>
  );
}
