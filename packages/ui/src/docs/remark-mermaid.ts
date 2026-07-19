/**
 * Turns ```mermaid fenced code blocks into <MermaidChart chart="..." />
 * mdast nodes so diagrams render inline from MDX — no registry, no name
 * indirection. Runs in the remark phase, before rehype-pretty-code sees
 * the tree. Shared by the blog and docs MDX pipelines.
 *
 * Walks the tree manually rather than via unist-util-visit: that package
 * isn't reliably resolvable from these apps' node_modules layout, and the
 * traversal here is a few lines anyway.
 */
type MdxNode = {
  type: string;
  lang?: string;
  value?: string;
  children?: MdxNode[];
  [key: string]: unknown;
};

export function remarkMermaid() {
  return (tree: MdxNode) => {
    walk(tree);
  };
}

function walk(node: MdxNode): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) walk(child);
  node.children = node.children.map(
    (child): MdxNode =>
      child.type === "code" && child.lang === "mermaid"
        ? {
            type: "mdxJsxFlowElement",
            name: "MermaidChart",
            attributes: [
              {
                type: "mdxJsxAttribute",
                name: "chart",
                value: child.value ?? "",
              },
            ],
            children: [],
          }
        : child
  );
}
