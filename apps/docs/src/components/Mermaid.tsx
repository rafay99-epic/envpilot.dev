"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let counter = 0;
let initialized = false;

/**
 * Diagram definitions live HERE, referenced from MDX by name:
 * `<Mermaid name="surfaces" />`. The docs' MDX pipeline (next-mdx-remote 6)
 * silently drops JSX brace expressions, so a template-literal `chart` prop
 * written in .mdx never reaches the component — a plain string attribute is
 * the only shape that survives. Keeping the diagram text in this module
 * keeps it editable while staying pipeline-proof.
 */
const DIAGRAMS = {
  surfaces: `flowchart TD
    A[CLI] --> W[WorkOS identity<br/>human auth]
    B[VS Code extension] --> W
    D[REST API] --> C
    E[MCP server] --> C
    F[GitHub Action] --> C
    C[_authorizeRequest<br/>one enforcement core for API keys] --> G[(Convex<br/>metadata + refs)]
    W --> G
    C --> H[(WorkOS Vault<br/>encrypted values)]`,
  "request-flow": `sequenceDiagram
    participant Agent
    participant MCP as MCP server
    participant Reviewer as Human reviewer
    Agent->>MCP: envpilot_request_variable(key, justification)
    MCP-->>Agent: request filed (status: pending)
    Note over Reviewer: Sees the request in the dashboard
    Reviewer->>Reviewer: Approve and supply the value
    loop Poll
      Agent->>MCP: envpilot_get_request_status
      MCP-->>Agent: pending / approved / rejected
    end
    Agent->>MCP: envpilot_get_variable(key)
    MCP-->>Agent: value (now readable)`,
} as const;

export type DiagramName = keyof typeof DIAGRAMS;

export function Mermaid({ name }: { name: DiagramName }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const chart = DIAGRAMS[name];

  useEffect(() => {
    if (!chart) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    if (!initialized) {
      // initialize() sets GLOBAL config — once per page, not per render.
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
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
        {chart ?? `Unknown diagram: ${String(name)}`}
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
