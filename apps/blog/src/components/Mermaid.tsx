import { MermaidChart } from "@envpilot/ui";
import { DIAGRAMS, type DiagramName } from "./diagrams";

/**
 * Diagram sources live in ./diagrams (one module per post), referenced from
 * MDX by name: `<Mermaid name="auth-cutover-bridge" />`. next-mdx-remote
 * silently drops JSX brace expressions, so passing the chart text as a prop
 * from .mdx does not work — a plain string attribute is the only shape that
 * survives the pipeline.
 */
export function Mermaid({ name }: { name: DiagramName }) {
  return <MermaidChart chart={DIAGRAMS[name]} />;
}
