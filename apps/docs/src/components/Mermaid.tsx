"use client";

import { useEffect, useRef, useState } from "react";

let counter = 0;
let initialized = false;

/**
 * Minimal client-side Mermaid renderer for MDX pages.
 *
 * Lazy-imports `mermaid` (keeps it out of the initial bundle) and renders
 * a diagram from the `chart` prop into a div, styled to match the docs'
 * terminal design system. No zoom/pan — diagrams are static.
 *
 * Usage in MDX: <Mermaid chart={`sequenceDiagram ...`} />
 */
export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [id] = useState(() => `mermaid-${++counter}`);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mermaid = (await import("mermaid")).default;
      if (!initialized) {
        // initialize() sets GLOBAL config — doing it per render would reset
        // it mid-flight for other diagrams on the same page.
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        initialized = true;
      }
      try {
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        // Invalid diagram — leave the container empty rather than crashing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
    />
  );
}
