import { MermaidChart } from "@envpilot/ui";

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
  return <MermaidChart chart={DIAGRAMS[name]} />;
}
