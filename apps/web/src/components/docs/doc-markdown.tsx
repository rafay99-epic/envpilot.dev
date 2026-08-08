"use client";

import { useDeferredValue, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSourceLines } from "@/lib/editor/source-lines";

/**
 * Renders a documentation page body.
 *
 * Loaded through `next/dynamic` by its callers: react-markdown plus the
 * remark chain is a few hundred KB, and the module index — the page people
 * land on — renders no markdown at all, so it should not pay for it.
 *
 * NO `rehype-raw`. Bodies here are written by teammates and by agents, which
 * makes them untrusted input to every other reader's browser; letting raw
 * HTML through would turn a documentation page into stored XSS. Markdown
 * only, deliberately. (wryte.xyz's preview does enable it behind
 * rehype-sanitize, because there the author IS the site owner — a different
 * threat model.)
 *
 * `remarkSourceLines` stamps `data-source-line` on every block. Every block
 * override below therefore spreads `...props` — dropping them would strip
 * those stamps and silently break both split-view scroll sync and
 * double-click-to-edit, with no visible error.
 */
export function DocMarkdown({ body }: { body: string }) {
  // Deferred + memoized: a keystroke re-renders this urgently but hits the
  // memo with the old body, while the expensive remark re-parse runs as an
  // interruptible background render — typing in split mode never blocks on
  // it. Same trick as wryte's MarkdownPreview.
  const deferredBody = useDeferredValue(body);

  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkSourceLines]}
        components={{
          h1: ({ children, ...props }) => (
            <h1
              className="mt-8 mb-4 scroll-mt-4 text-2xl font-bold text-zinc-900 first:mt-0 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="mt-8 mb-3 scroll-mt-4 border-b border-zinc-200 pb-2 text-xl font-semibold text-zinc-900 first:mt-0 dark:border-zinc-800 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="mt-6 mb-2 scroll-mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4
              className="mt-5 mb-2 scroll-mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              {...props}
            >
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p
              className="mb-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul
              className="mb-4 list-disc space-y-1 pl-6 text-sm text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="mb-4 list-decimal space-y-1 pl-6 text-sm text-zinc-700 dark:text-zinc-300"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              // Agent- and teammate-authored links are untrusted: noopener
              // stops the target reaching back through window.opener.
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-green-600 underline underline-offset-2 hover:text-green-500 dark:text-green-400"
              {...props}
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code
                  className="block font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-green-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-green-400"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre
              className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
              {...props}
            >
              {children}
            </pre>
          ),
          table: ({ children, ...props }) => (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border-b border-zinc-300 px-3 py-2 text-left text-xs font-semibold text-zinc-600 uppercase dark:border-zinc-700 dark:text-zinc-400"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="border-b border-zinc-200 px-3 py-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
              {...props}
            >
              {children}
            </td>
          ),
          blockquote: ({ children, ...props }) => (
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
