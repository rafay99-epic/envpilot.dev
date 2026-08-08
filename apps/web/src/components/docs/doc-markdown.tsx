"use client";

import { useDeferredValue, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSourceLines } from "@/lib/editor/source-lines";

/**
 * Renders a doc body. Loaded via `next/dynamic` — the remark chain is a few
 * hundred KB and the module index renders no markdown at all.
 *
 * NO `rehype-raw`: bodies are written by teammates and agents, so raw HTML
 * would be stored XSS in every other reader's browser.
 *
 * Every block override spreads `...props` — dropping them strips the
 * `data-source-line` stamps and silently breaks split sync and
 * double-click-to-edit.
 */
export function DocMarkdown({ body }: { body: string }) {
  // Deferred + memoized so the remark re-parse runs as an interruptible
  // background render — typing in split mode never blocks on it.
  const deferredBody = useDeferredValue(body);

  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkSourceLines]}
        components={{
          h1: ({ node, children, ...props }) => (
            <h1
              className="mt-8 mb-4 scroll-mt-4 text-2xl font-bold text-zinc-900 first:mt-0 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2
              className="mt-8 mb-3 scroll-mt-4 border-b border-zinc-200 pb-2 text-xl font-semibold text-zinc-900 first:mt-0 dark:border-zinc-800 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3
              className="mt-6 mb-2 scroll-mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h3>
          ),
          h4: ({ node, children, ...props }) => (
            <h4
              className="mt-5 mb-2 scroll-mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h4>
          ),
          p: ({ node, children, ...props }) => (
            <p
              className="mb-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </p>
          ),
          ul: ({ node, children, ...props }) => (
            <ul
              className="mb-4 list-disc space-y-1 pl-6 text-sm text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol
              className="mb-4 list-decimal space-y-1 pl-6 text-sm text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ node, children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          a: ({ node, href, children, ...props }) => (
            <a
              href={href}
              // Untrusted authors: noopener stops window.opener reach-back.
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-green-600 underline underline-offset-2 hover:text-green-500 dark:text-green-400"
              {...props}
            >
              {children}
            </a>
          ),
          // Inline styling always; `pre` neutralises it for block code. A
          // language-less fence carries no className, so it is indis-
          // tinguishable from inline code here — the parent is the only
          // reliable signal.
          code: ({ node, className, children, ...props }) => (
            <code
              className="rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-green-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-green-400"
              {...props}
            >
              {children}
            </code>
          ),
          pre: ({ node, children, ...props }) => (
            <pre
              className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 [&>code]:block [&>code]:rounded-none [&>code]:border-0 [&>code]:bg-transparent [&>code]:px-0 [&>code]:py-0 [&>code]:text-xs [&>code]:leading-relaxed [&>code]:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:[&>code]:bg-transparent dark:[&>code]:text-zinc-200"
              {...props}
            >
              {children}
            </pre>
          ),
          table: ({ node, children, ...props }) => (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ node, children, ...props }) => (
            <th
              className="border-b border-zinc-300 px-3 py-2 text-left text-xs font-semibold text-zinc-600 uppercase dark:border-zinc-700 dark:text-zinc-400"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ node, children, ...props }) => (
            <td
              className="border-b border-zinc-200 px-3 py-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
              {...props}
            >
              {children}
            </td>
          ),
          blockquote: ({ node, children, ...props }) => (
            <blockquote
              className="mb-4 border-l-2 border-green-500/40 pl-4 text-sm text-zinc-600 italic dark:text-zinc-400"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: (props) => (
            <hr
              className="my-6 border-zinc-200 dark:border-zinc-800"
              {...props}
            />
          ),
        }}
      >
        {deferredBody}
      </ReactMarkdown>
    ),
    [deferredBody]
  );

  return <div className="max-w-none">{rendered}</div>;
}
