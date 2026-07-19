"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let counter = 0;
let initialized = false;

/**
 * Renders one mermaid diagram from its source text.
 *
 * Authors write standard ```mermaid fenced code blocks in MDX; the shared
 * remarkMermaid plugin (./remark-mermaid.ts) rewrites those fences into
 * <MermaidChart chart="..."> nodes at the remark phase. The chart text
 * travels as a plain string attribute, which is the only shape that
 * the only shape that survives the pipeline.
 */
export function MermaidChart({ chart }: { chart: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!chart) {
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
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((error: unknown) => {
        console.error("mermaid render failed", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    return (
      <pre className="my-6 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-400">
        {chart ?? "Unknown diagram"}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
    />
  );
}
