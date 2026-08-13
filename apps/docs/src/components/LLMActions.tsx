"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, MessageSquare, Terminal } from "lucide-react";
import { SITE_URLS } from "@envpilot/ui";

interface LLMActionsProps {
  slug: string;
  title: string;
}

const pillClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-subtle transition-colors hover:border-accent-line hover:text-accent";

/**
 * Compact row of "ask an LLM" actions for a doc page: copy the raw
 * markdown source, or open a pre-filled prompt in Claude, ChatGPT,
 * or Cursor.
 */
export function LLMActions({ slug, title }: LLMActionsProps) {
  const [copied, setCopied] = useState(false);

  const prompt = `Read ${SITE_URLS.docs}/md/${slug} and help me with "${title}" from the Envpilot docs.`;
  const encodedPrompt = encodeURIComponent(prompt);

  async function handleCopy() {
    const res = await fetch(`/md/${slug}`);
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={handleCopy} className={pillClassName}>
        {copied ? (
          <>
            <Check className="h-3 w-3" />
            copied ✓
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
