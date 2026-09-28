import { ConvexError } from "convex/values";
import { slugifyTitle } from "./guards";

export const DOC_PAGE_CHARS = 60_000;

export type DocSection = {
  id: string;
  title: string;
  level: number;
  start: number;
  end: number;
};

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;
const FENCE = /^[ \t]*(?:```|~~~)/;

type Line = { start: number; next: number; text: string; inFence: boolean };

function lines(body: string): Line[] {
  const out: Line[] = [];
  let inFence = false;
  let start = 0;
  while (start <= body.length) {
    const newline = body.indexOf("\n", start);
    const end = newline === -1 ? body.length : newline;
    const text = body.slice(start, end);
    const isFence = FENCE.test(text);
    out.push({ start, next: end + 1, text, inFence: inFence || isFence });
    if (isFence) inFence = !inFence;
    if (newline === -1) break;
    start = end + 1;
  }
  return out;
}

export function parseSections(body: string): DocSection[] {
  const sections: DocSection[] = [];
  const seen = new Map<string, number>();
  for (const line of lines(body)) {
    if (line.inFence) continue;
    const [, hashes = "", raw = ""] = HEADING.exec(line.text) ?? [];
    if (!hashes) continue;
    const title = raw.trim();
    const base = slugifyTitle(title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    sections.push({
      id: count === 1 ? base : `${base}-${count}`,
      title,
      level: hashes.length,
      start: line.start,
      end: body.length,
    });
  }
  sections.forEach((section, i) => {
    const next = sections
      .slice(i + 1)
      .find((later) => later.level <= section.level);
    section.end = next ? next.start : body.length;
  });
  return sections;
}

export function findSection(body: string, id: string): DocSection {
  const sections = parseSections(body);
  const section = sections.find((s) => s.id === id);
  if (!section) {
    const known = sections
      .slice(0, 30)
      .map((s) => s.id)
      .join(", ");
    throw new ConvexError(
      known
        ? `No section "${id}" in this page. Sections: ${known}`
        : `No section "${id}" in this page. It has no headings.`
    );
  }
  return section;
}

export function parseCursor(
  cursor: string | undefined,
  length: number
): number {
  if (cursor === undefined) return 0;
  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0 || offset > length) {
    throw new ConvexError(
      "Invalid cursor. Pass the nextCursor value from the previous call."
    );
  }
  return offset;
}

export function pageOf(
  text: string,
  offset: number,
  max: number = DOC_PAGE_CHARS
): { chunk: string; nextOffset?: number } {
  const hardEnd = offset + max;
  if (hardEnd >= text.length) return { chunk: text.slice(offset) };

  let paragraph = -1;
  let line = -1;
  for (const l of lines(text)) {
    if (l.next > hardEnd) break;
    if (l.next <= offset || l.inFence) continue;
    line = l.next;
    if (l.text.trim() === "") paragraph = l.next;
  }
  const end = paragraph > offset ? paragraph : line > offset ? line : hardEnd;
  return { chunk: text.slice(offset, end), nextOffset: end };
}

export function replaceSection(
  body: string,
  id: string,
  replacement: string
): string {
  const section = findSection(body, id);
  const tail = body.slice(section.end);
  const text =
    tail.length > 0 && !replacement.endsWith("\n")
      ? `${replacement}\n\n`
      : replacement;
  return body.slice(0, section.start) + text + tail;
}

export function appendToBody(body: string, addition: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return trimmed.length === 0 ? addition : `${trimmed}\n\n${addition}`;
}
