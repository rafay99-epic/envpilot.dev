import type { ComponentPropsWithoutRef } from "react";
import { CodeBlock } from "./CodeBlock";

type P<T extends React.ElementType> = ComponentPropsWithoutRef<T>;

/**
 * MDX component overrides for Envpilot documentation.
 *
 * Built on the shared marketing design system:
 *   - Canvas: zinc-950, mono body text (inherited from MarketingShell)
 *   - Headings: sans, semibold/bold, tracking-tight, zinc-100
 *   - Accent: green-400/500 (#22c55e family) only
 *   - Code blocks: terminal-style frames; rehype-pretty-code CSS in
 *     globals.css handles line/token styling inside.
 *
 * remark-gfm handles tables, strikethrough, and task lists.
 */

/** Slugify heading text the same way the on-this-page rail does. */
function headingId(children: React.ReactNode): string | undefined {
  return typeof children === "string"
    ? children
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    : undefined;
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      className="ml-2 font-mono text-accent opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
      aria-label="Link to section"
    >
      #
    </a>
  );
}

export const docsComponents = {
  // ── Headings ──────────────────────────────────────────────────────────

  h1: (props: P<"h1">) => (
    <h1
      className="mb-4 font-sans text-3xl font-bold tracking-tight text-ink md:text-4xl"
      {...props}
    />
  ),

  h2: (props: P<"h2">) => {
    const id = headingId(props.children);
    return (
      <h2
        id={id}
        className="group mb-4 mt-14 scroll-mt-24 border-b border-line pb-2 font-sans text-xl font-semibold tracking-tight text-ink first:mt-0 md:text-2xl"
        {...props}
      >
        {props.children}
        {id && <HeadingAnchor id={id} />}
      </h2>
    );
  },

  h3: (props: P<"h3">) => {
    const id = headingId(props.children);
    return (
      <h3
        id={id}
        className="group mb-3 mt-10 scroll-mt-24 font-sans text-lg font-semibold tracking-tight text-ink"
        {...props}
      >
        {props.children}
        {id && <HeadingAnchor id={id} />}
      </h3>
    );
  },

  h4: (props: P<"h4">) => (
    <h4
      className="mb-2 mt-8 font-sans text-base font-semibold text-ink"
      {...props}
    />
  ),

  // ── Prose ─────────────────────────────────────────────────────────────

  p: (props: P<"p">) => (
    <p className="mb-4 text-sm leading-relaxed text-ink-muted" {...props} />
  ),

  a: (props: P<"a">) => (
    <a
      className="font-medium text-accent underline-offset-4 transition-colors hover:text-accent hover:underline"
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
    <strong className="font-semibold text-ink" {...props} />
  ),

  em: (props: P<"em">) => <em className="italic text-ink-muted" {...props} />,

  // ── Lists ─────────────────────────────────────────────────────────────

  ul: (props: P<"ul">) => (
    <ul
      className="mb-5 space-y-2 pl-5 text-ink-muted [&>li]:relative [&>li]:before:absolute [&>li]:before:-left-4 [&>li]:before:top-[0.6em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-accent-soft"
      {...props}
    />
  ),

  ol: (props: P<"ol">) => (
    <ol
      className="mb-5 list-decimal space-y-2 pl-5 text-ink-muted marker:font-mono marker:text-accent/70"
      {...props}
    />
  ),

  li: (props: P<"li">) => <li className="text-sm leading-relaxed" {...props} />,

  // ── Code blocks (rehype-pretty-code output) ────────────────────────────
  // rehype-pretty-code wraps fenced blocks in: <figure> → <pre> → <code>
  // We intercept <figure> to wrap it in the terminal-style CodeBlock,
  // and <pre> renders the scrollable code area inside it. The terminal
  // line/token CSS lives in globals.css — we only provide the frame.

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
      className="overflow-x-auto bg-[#0f172a] py-4 font-mono text-sm leading-relaxed"
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

    // Inline code — green-tinted bordered chip
    return (
      <code
        className="rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
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
      className="mb-5 rounded-r-lg border-l-2 border-accent-line bg-surface/40 py-3 pl-4 pr-4 text-sm leading-relaxed text-ink-muted [&>p:last-child]:mb-0"
      {...props}
    />
  ),

  // ── Dividers ──────────────────────────────────────────────────────────

  hr: () => <hr className="my-10 border-line" />,

  // ── Tables ────────────────────────────────────────────────────────────

  table: (props: P<"table">) => (
    <div className="mb-6 overflow-x-auto rounded-xl border border-line bg-surface/40">
      <table className="w-full text-sm" {...props} />
    </div>
  ),

  thead: (props: P<"thead">) => (
    <thead className="border-b border-line bg-surface/60" {...props} />
  ),

  th: (props: P<"th">) => (
    <th
      className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold tracking-wide text-ink-muted"
      {...props}
    />
  ),

  tbody: (props: P<"tbody">) => <tbody {...props} />,

  tr: (props: P<"tr">) => (
    <tr
      className="border-b border-line transition-colors last:border-b-0 hover:bg-accent/[0.03]"
      {...props}
    />
  ),

  td: (props: P<"td">) => (
    <td
      className="px-4 py-3 align-top text-sm leading-relaxed text-ink-muted"
      {...props}
    />
  ),

  // ── Media ─────────────────────────────────────────────────────────────

  // Deliberately a raw <img>, not next/image: MDX content embeds images
  // from arbitrary external hosts, which the next/image optimizer rejects
  // unless every host is allowlisted in images.remotePatterns. lazy-loading
  // covers the main win; revisit only if content images become a CLS/LCP
  // problem.
  img: (props: P<"img">) => (
    <figure className="mb-5">
      <img
        className="rounded-xl border border-line"
        loading="lazy"
        alt={props.alt ?? ""}
        {...props}
      />
      {props.alt && (
        <figcaption className="mt-2 text-center text-xs text-ink-faint">
          {props.alt}
        </figcaption>
      )}
    </figure>
  ),
};
