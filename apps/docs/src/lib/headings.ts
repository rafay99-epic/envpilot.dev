export interface DocHeading {
  depth: number;
  text: string;
  id: string;
}

/**
 * Extract h2/h3 headings from a raw MDX body.
 *
 * Ids follow the same slug rules as the MDX heading components, and headings
 * containing markdown syntax are skipped because the rendered heading would
 * not receive an id in that case. Shared by the "on this page" rail and the
 * search index so both agree on what a page contains.
 */
export function extractHeadings(content: string): DocHeading[] {
  const headings: DocHeading[] = [];
  // Strip fenced code blocks so `#` comments inside them never match.
  const stripped = content.replace(/```[\s\S]*?```/g, "");
  for (const match of stripped.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    const text = match[2].trim();
    if (/[`[\]{}<>*_|]/.test(text)) continue;
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    if (!id) continue;
    headings.push({ depth: match[1].length, text, id });
  }
  return headings;
}
