/**
 * Heading outline extracted from markdown for the outline panel.
 * Pure string parsing — single pass, no markdown AST — so it's cheap
 * enough to run on every keystroke while the panel is open.

 * Ported from wryte.xyz (apps/web/src/features/editor/lib/outline.ts).
 * Pure logic, no wryte dependencies — kept verbatim so fixes can be diffed
 * against the original.
 */

export type OutlineHeading = {
  /** 1–6, from the number of `#` characters. */
  level: number;
  text: string;
  /** Character offsets of the heading line in the document. */
  start: number;
  end: number;
};

// Up to 3 leading spaces still make an ATX heading (CommonMark); 4 is code.
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*\S)/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function parseOutline(content: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  /** Marker that opened the current fence, or null outside one. */
  let fence: string | null = null;
  let offset = 0;

  for (const line of content.split("\n")) {
    const marker = FENCE_RE.exec(line.trimStart())?.[1];
    if (marker) {
      // A fence only closes on its own marker, at least as long — so a ~~~
      // sample inside a ``` block doesn't end it early.
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
    } else if (fence === null) {
      const match = HEADING_RE.exec(line);
      if (match) {
        headings.push({
          level: (match[1] as string).length,
          // Strip optional ATX closing hashes ("## Title ##").
          text: (match[2] as string).replace(/\s+#+\s*$/, ""),
          start: offset,
          end: offset + line.length,
        });
      }
    }
    offset += line.length + 1;
  }
  return headings;
}
