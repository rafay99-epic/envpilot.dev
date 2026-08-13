"use client";

import { useEffect, useState } from "react";
import mermaid from "mermaid";

let counter = 0;
let initialized = false;

/**
 * Parser bounds. A doc body is capped at 256KB and a body of `graph TD` edges
 * is perfectly legal markdown — without these, one page hangs the reader's
 * tab. Exceeding a bound throws inside mermaid, which lands in the same
 * fallback as a syntax error: the source, rendered as text.
 */
const MAX_TEXT_SIZE = 50_000;
const MAX_EDGES = 500;

/**
 * Renders one mermaid diagram from its source text.
 *
 * Two authoring paths reach this component. In MDX (blog, docs) the shared
 * remarkMermaid plugin (./remark-mermaid.ts) rewrites ```mermaid fences into
 * <MermaidChart chart="..."> nodes at the remark phase. In the dashboard's
 * react-markdown reader there is no MDX, so `pre` is overridden and calls
 * this directly. Either way the chart text travels as a plain string.
 *
 * securityLevel "strict" is load-bearing, not hygiene: doc bodies are written
 * by teammates AND by coding agents over MCP. Looser levels let a diagram
 * carry HTML in node labels and `click` callbacks, which is stored XSS in the
 * next reader's authenticated session.
 */
export function MermaidChart({ chart }: { chart: string | undefined }) {
  // The SVG lives in state rather than being written into a ref: the ref
  // approach cannot recover from a failed render (the target div is unmounted
  // while the fallback shows, so a later success has nowhere to write), which
  // strands every diagram the editor's live preview sees mid-keystroke.
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!chart || chart.trim().length === 0) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    if (!initialized) {
      // initialize() sets GLOBAL config — once per page, not per render.
      // useMaxWidth:false keeps diagrams at their natural size instead of
      // scaling them down to the container — a wide sequence diagram shrunk
      // to fit is unreadable. The wrapper scrolls horizontally instead.
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        maxTextSize: MAX_TEXT_SIZE,
        maxEdges: MAX_EDGES,
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false },
      });
      initialized = true;
    }

    // Fresh id per render call — StrictMode double-invokes effects, and
    // mermaid.render leaves artifacts behind a reused id.
    const id = `mermaid-${++counter}`;
    mermaid
      .render(id, chart)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        setSvg(rendered);
        setFailed(false);
      })
      .catch((error: unknown) => {
        console.error("mermaid render failed", error);
        // A throw leaves mermaid's offscreen measurement node behind. The
        // editor's live preview fails on nearly every keystroke of an
        // unfinished diagram, so without this the body accumulates orphans.
        document.getElementById(`d${id}`)?.remove();
        if (cancelled) return;
        setSvg(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    return (
      <pre className="my-6 overflow-x-auto rounded-xl border border-line bg-surface/40 p-4 text-xs text-ink-muted">
        {chart ?? "Unknown diagram"}
      </pre>
    );
  }

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-xl border border-line bg-surface/40 p-4"
      // mermaid owns this markup and, at securityLevel "strict", sanitizes it
      // before returning. Nothing from the doc body reaches here unfiltered.
      dangerouslySetInnerHTML={svg === null ? undefined : { __html: svg }}
    />
  );
}
