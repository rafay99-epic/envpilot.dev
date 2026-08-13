"use client";

import { useDeferredValue, useMemo } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@envpilot/ui/docs";
import { remarkSourceLines } from "@/lib/editor/source-lines";

// Mermaid is ~500KB and most pages have no diagram, so it loads only when a
// ```mermaid fence actually renders. The MDX apps reach the same component
// through remarkMermaid; react-markdown has no MDX phase, so the `pre`
// override below is this pipeline's equivalent.
const MermaidChart = dynamic(
  // The `/docs` entry point, not the package root: the root barrel also
  // re-exports the marketing components (framer-motion, particle canvas),
  // which would land in this lazily-loaded chunk and undo the saving.
  () => import("@envpilot/ui/docs").then((m) => m.MermaidChart),
  {
    ssr: false,
    loading: () => (
      <div className="my-6 h-24 animate-pulse rounded-xl border border-line bg-surface/40" />
    ),
  }
);

/**
 * Minimal structural view of the hast nodes react-markdown passes to a
 * component override. Declared here rather than imported from `hast` for the
 * same reason remark-mermaid.ts walks the tree by hand: those types are not a
 * direct dependency of this app.
 */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

/** The `language-x` suffix on a fence, if it declared one. */
function fenceLanguage(code: HastNode): string | undefined {
  const classes = code.properties?.className;
  const list = Array.isArray(classes)
    ? classes
    : typeof classes === "string"
      ? [classes]
      : [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.startsWith("language-")) {
      return entry.slice("language-".length);
    }
  }
  return undefined;
}

/** The `code` child of any fenced block, mermaid or otherwise. */
function fenceCode(node: unknown): HastNode | undefined {
  const first = (node as HastNode | undefined)?.children?.[0];
  if (first?.type !== "element" || first.tagName !== "code") return undefined;
  return first;
}

/** The `code` child of a ```mermaid fence; undefined for every other fence. */
function mermaidFence(node: unknown): HastNode | undefined {
  const code = fenceCode(node);
  return code && fenceLanguage(code) === "mermaid" ? code : undefined;
}

/** Fence body, rebuilt from its text children. */
function fenceText(code: HastNode): string {
  return (code.children ?? [])
    .map((child) => (child.type === "text" ? (child.value ?? "") : ""))
    .join("")
    .replace(/\n$/, "");
}

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
              className="mt-8 mb-4 scroll-mt-4 text-2xl font-bold first:mt-0 text-ink"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2
              className="mt-8 mb-3 scroll-mt-4 border-b pb-2 text-xl font-semibold first:mt-0 border-line text-ink"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3
              className="mt-6 mb-2 scroll-mt-4 text-base font-semibold text-ink"
              {...props}
            >
              {children}
            </h3>
          ),
          h4: ({ node, children, ...props }) => (
            <h4
              className="mt-5 mb-2 scroll-mt-4 text-sm font-semibold text-ink"
              {...props}
            >
              {children}
            </h4>
          ),
          // Prose keeps a reading measure of its own so the container can be
          // wide enough for tables, code and diagrams without stretching
          // sentences past what is comfortable to read.
          p: ({ node, children, ...props }) => (
            <p
              className="mb-4 max-w-[72ch] text-sm leading-relaxed text-ink-muted"
              {...props}
            >
              {children}
            </p>
          ),
          ul: ({ node, children, ...props }) => (
            <ul
              className="mb-4 max-w-[72ch] list-disc space-y-1 pl-6 text-sm text-ink-muted"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol
              className="mb-4 max-w-[72ch] list-decimal space-y-1 pl-6 text-sm text-ink-muted"
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
              className="text-accent-hover underline underline-offset-2 hover:text-accent"
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
              className="rounded border px-1 py-0.5 font-mono text-[0.85em] border-line bg-surface-raised text-accent"
              {...props}
            >
              {children}
            </code>
          ),
          // A ```mermaid fence renders as a diagram; every other fence stays a
          // code block. The override sits on `pre` rather than `code` because
          // a diagram is a <div> and a <div> inside <pre> is invalid nesting.
          pre: ({ node, children, ...props }) => {
            const fence = mermaidFence(node);
            if (fence) {
              // `...props` carries the data-source-line stamp, which remark
              // puts on the `pre`. The wrapper has to keep it or split sync
              // and double-click-to-edit go dead on diagrams.
              return (
                <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>
                  <MermaidChart chart={fenceText(fence)} />
                </div>
              );
            }
            // The SAME terminal frame the blog and the docs site use, so a
            // code block in a project doc gets the copy button and the
            // language label instead of a second, plainer treatment.
            const code = fenceCode(node);
            return (
              <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>
                <CodeBlock language={code ? fenceLanguage(code) : undefined}>
                  <pre className="overflow-x-auto bg-canvas p-4 [&>code]:block [&>code]:rounded-none [&>code]:border-0 [&>code]:bg-transparent [&>code]:px-0 [&>code]:py-0 [&>code]:text-xs [&>code]:leading-relaxed [&>code]:text-ink">
                    {children}
                  </pre>
                </CodeBlock>
              </div>
            );
          },
          // `w-max min-w-full`, not `w-full`: a cell holding a long path or
          // code chip used to squeeze every other column down to one word per
          // line. Columns now take their natural width and the frame scrolls.
          table: ({ node, children, ...props }) => (
            <div className="mb-6 overflow-x-auto rounded-xl border border-line">
              <table
                className="w-max min-w-full border-collapse text-sm"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ node, children, ...props }) => (
            <thead className="border-b border-line bg-surface/60" {...props}>
              {children}
            </thead>
          ),
          tr: ({ node, children, ...props }) => (
            <tr className="border-b last:border-b-0 border-line" {...props}>
              {children}
            </tr>
          ),
          th: ({ node, children, ...props }) => (
            <th
              className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap uppercase text-ink-muted"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ node, children, ...props }) => (
            <td
              className="px-4 py-2.5 align-top leading-relaxed text-ink-muted"
              {...props}
            >
              {children}
            </td>
          ),
          blockquote: ({ node, children, ...props }) => (
            <blockquote
              className="mb-4 max-w-[72ch] border-l-2 border-accent-line pl-4 text-sm italic text-ink-muted"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: (props) => <hr className="my-6 border-line" {...props} />,
        }}
      >
        {deferredBody}
      </ReactMarkdown>
    ),
    [deferredBody]
  );

  return <div className="max-w-none">{rendered}</div>;
}
