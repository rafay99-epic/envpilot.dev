import type { ComponentPropsWithoutRef } from "react";
import { CodeBlock } from "./CodeBlock";

type P<T extends React.ElementType> = ComponentPropsWithoutRef<T>;

/**
 * MDX component overrides for Envpilot documentation.
 *
 * Matches the landing page's terminal aesthetic:
 *   - Background: zinc-950 / #0f172a
 *   - Accent: green-400 (#4ade80) / green-500 (#22c55e)
 *   - Code blocks: terminal-style with traffic lights
 *   - Borders: zinc-800 / zinc-700/50
 *   - Font: Geist Sans + Geist Mono
 *
 * rehype-pretty-code handles syntax highlighting via Shiki.
 * remark-gfm handles tables, strikethrough, and task lists.
 */
export const docsComponents = {
  // ── Headings ──────────────────────────────────────────────────────────

  h1: (props: P<"h1">) => (
    <h1
      className="mb-3 font-sans text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl"
      {...props}
    />
  ),

  h2: (props: P<"h2">) => {
    const id =
      typeof props.children === "string"
        ? props.children
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        : undefined;
    return (
      <h2
        id={id}
        className="group mb-4 mt-14 scroll-mt-20 border-b border-zinc-800/50 pb-2 font-sans text-xl font-semibold text-zinc-100 first:mt-0"
        {...props}
      >
        {props.children}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Link to section"
          >
            #
          </a>
        )}
      </h2>
    );
  },

  h3: (props: P<"h3">) => {
    const id =
      typeof props.children === "string"
        ? props.children
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        : undefined;
    return (
      <h3
        id={id}
        className="group mb-3 mt-10 scroll-mt-20 font-sans text-lg font-semibold text-zinc-200"
        {...props}
      >
        {props.children}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Link to section"
          >
            #
          </a>
        )}
      </h3>
    );
  },

  h4: (props: P<"h4">) => (
    <h4
      className="mb-2 mt-8 font-sans text-base font-semibold text-zinc-300"
      {...props}
    />
  ),

  // ── Prose ─────────────────────────────────────────────────────────────

  p: (props: P<"p">) => (
    <p className="mb-4 font-sans leading-7 text-zinc-400" {...props} />
  ),

  a: (props: P<"a">) => (
    <a
      className="font-medium text-green-400 underline decoration-green-400/30 underline-offset-4 transition-colors hover:text-green-300 hover:decoration-green-300/50"
      target={
        typeof props.href === "string" && props.href.startsWith("http")
          ? "_blank"
          : undefined
      }
      rel={
        typeof props.href === "string" && props.href.startsWith("http")
          ? "noopener noreferrer"
          : undefined
      }
      {...props}
    />
  ),

  strong: (props: P<"strong">) => (
    <strong className="font-semibold text-zinc-200" {...props} />
  ),

  em: (props: P<"em">) => <em className="italic text-zinc-300" {...props} />,

  // ── Lists ─────────────────────────────────────────────────────────────

  ul: (props: P<"ul">) => (
    <ul
      className="mb-5 space-y-2 pl-5 text-zinc-400 [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-4 [&>li]:before:top-[0.65em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-green-500/50"
      {...props}
    />
  ),

  ol: (props: P<"ol">) => (
    <ol
      className="mb-5 list-decimal space-y-2 pl-5 text-zinc-400 marker:text-zinc-600"
      {...props}
    />
  ),

  li: (props: P<"li">) => <li className="font-sans leading-7" {...props} />,

  // ── Code blocks (rehype-pretty-code output) ────────────────────────────
  // rehype-pretty-code wraps fenced blocks in: <figure> → <pre> → <code>
  // We intercept <figure> to wrap it in the terminal-style CodeBlock,
  // and <pre> renders the scrollable code area inside it.

  figure: (props: P<"figure">) => {
    const rec = props as Record<string, unknown>;
    const isPrettyCode = "data-rehype-pretty-code-figure" in rec;
    if (isPrettyCode) {
      // Extract the language from the nested <code data-language="...">
      let language: string | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pre = (props.children as any)?.[0] ?? props.children;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (pre as any)?.props?.children;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        language = (code as any)?.props?.["data-language"] as string;
      } catch {
        // fallback — no language detected
      }
      return <CodeBlock language={language}>{props.children}</CodeBlock>;
    }
    return <figure {...props} />;
  },

  pre: (props: P<"pre">) => (
    <pre
      className="overflow-x-auto bg-[#0f172a] p-5 font-mono text-sm leading-relaxed"
      {...props}
    />
  ),

  code: (props: P<"code">) => {
    // Block code — rendered by rehype-pretty-code
    const hasDataAttrs =
      "data-language" in (props as Record<string, unknown>) ||
      "data-theme" in (props as Record<string, unknown>);
    if (hasDataAttrs) {
      return <code className="grid font-mono" {...props} />;
    }

    // Inline code
    return (
      <code
        className="rounded border border-zinc-700/50 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-green-400"
        {...props}
      />
    );
  },

  span: (props: P<"span">) => {
    if ("data-line" in (props as Record<string, unknown>)) {
      return (
        <span
          className="inline-block w-full border-l-2 border-transparent px-4 leading-relaxed"
          {...props}
        />
      );
    }
    return <span {...props} />;
  },

  // ── Blockquotes ───────────────────────────────────────────────────────

  blockquote: (props: P<"blockquote">) => (
    <blockquote
      className="mb-5 border-l-2 border-green-500/40 bg-green-500/5 py-3 pl-4 pr-4 text-sm leading-relaxed text-zinc-400 [&>p:last-child]:mb-0"
      {...props}
    />
  ),

  // ── Dividers ──────────────────────────────────────────────────────────

  hr: () => <hr className="my-10 border-zinc-800/50" />,

  // ── Tables ────────────────────────────────────────────────────────────

  table: (props: P<"table">) => (
    <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-700/50">
      <table className="w-full text-sm" {...props} />
    </div>
  ),

  thead: (props: P<"thead">) => (
    <thead className="border-b border-zinc-700/50 bg-zinc-800/50" {...props} />
  ),

  th: (props: P<"th">) => (
    <th
      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-zinc-300"
      {...props}
    />
  ),

  tbody: (props: P<"tbody">) => <tbody {...props} />,

  tr: (props: P<"tr">) => (
    <tr
      className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/20"
      {...props}
    />
  ),

  td: (props: P<"td">) => (
    <td className="px-4 py-3 align-top font-sans text-zinc-400" {...props} />
  ),

  // ── Media ─────────────────────────────────────────────────────────────

  img: (props: P<"img">) => (
    <figure className="mb-5">
      <img // eslint-disable-line @next/next/no-img-element -- MDX images
        className="rounded-lg border border-zinc-700/50"
        loading="lazy"
        alt={props.alt ?? ""}
        {...props}
      />
      {props.alt && (
        <figcaption className="mt-2 text-center text-xs text-zinc-600">
          {props.alt}
        </figcaption>
      )}
    </figure>
  ),
};
