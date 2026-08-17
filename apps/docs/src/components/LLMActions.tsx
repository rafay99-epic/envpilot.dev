"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Sparkles,
  MessageSquare,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { SITE_URLS } from "@envpilot/ui";

interface LLMActionsProps {
  slug: string;
  title: string;
}

type CopyState = "idle" | "copied" | "failed";

const pillClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-subtle transition-colors hover:border-accent-line hover:text-accent";

/**
 * Compact row of "ask an LLM" actions for a doc page: copy the raw
 * markdown source, or open a pre-filled prompt in Claude, ChatGPT,
 * or Cursor.
 */
export function LLMActions({ slug, title }: LLMActionsProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const prompt = `Read ${SITE_URLS.docs}/md/${slug} and help me with "${title}" from the Envpilot docs.`;
  const encodedPrompt = encodeURIComponent(prompt);

  async function handleCopy() {
    try {
      const res = await fetch(`/md/${slug}`);
      // Without this guard a 404 HTML error page lands on the clipboard
      // looking exactly like the doc the reader asked for.
      if (!res.ok) throw new Error(`/md/${slug} responded ${res.status}`);
      await navigator.clipboard.writeText(await res.text());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className={pillClassName}
      >
        {copyState === "copied" ? (
          <>
            <Check className="h-3 w-3" />
            copied ✓
          </>
        ) : copyState === "failed" ? (
          <>
            <TriangleAlert className="h-3 w-3" />
            copy failed
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            copy markdown
          </>
        )}
      </button>

      <a
        href={`https://claude.ai/new?q=${encodedPrompt}`}
        target="_blank"
        rel="noopener noreferrer"
        className={pillClassName}
      >
        <Sparkles className="h-3 w-3" />
        open in claude
      </a>

      <a
        href={`https://chatgpt.com/?q=${encodedPrompt}`}
        target="_blank"
        rel="noopener noreferrer"
        className={pillClassName}
      >
        <MessageSquare className="h-3 w-3" />
        open in chatgpt
      </a>

      <a
        href={`cursor://anysphere.cursor-deeplink/prompt?text=${encodedPrompt}`}
        className={pillClassName}
      >
        <Terminal className="h-3 w-3" />
        open in cursor
      </a>
    </div>
  );
}
