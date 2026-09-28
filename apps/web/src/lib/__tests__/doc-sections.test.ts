import { describe, expect, it } from "vitest";

import {
  appendToBody,
  pageOf,
  parseCursor,
  parseSections,
  replaceSection,
} from "@convex/features/docs/sections";

const doc = [
  "# Orders API",
  "",
  "Intro text.",
  "",
  "## Create",
  "",
  "POST /orders",
  "",
  "```md",
  "## not a heading",
  "```",
  "",
  "## Errors",
  "",
  "409 on duplicate.",
  "",
  "## Create",
  "",
  "Second create section.",
].join("\n");

describe("parseSections", () => {
  it("ignores headings inside code fences and dedupes ids", () => {
    const sections = parseSections(doc);
    expect(sections.map((s) => s.id)).toEqual([
      "orders-api",
      "create",
      "errors",
      "create-2",
    ]);
  });

  it("ends a section at the next heading of the same or higher level", () => {
    const [top, create] = parseSections(doc);
    expect(top?.end).toBe(doc.length);
    expect(doc.slice(create?.start, create?.end)).toContain("## not a heading");
    expect(doc.slice(create?.start, create?.end)).not.toContain("## Errors");
  });
});

describe("pageOf", () => {
  it("returns the whole text when it fits", () => {
    expect(pageOf("short", 0, 100)).toEqual({ chunk: "short" });
  });

  it("covers the text exactly across pages without splitting a fence", () => {
    const body = Array.from(
      { length: 40 },
      (_, i) => `Paragraph ${i}\n\n\`\`\`\ncode ${i}\nmore ${i}\n\`\`\`\n`
    ).join("\n");
    let offset = 0;
    let rebuilt = "";
    for (let guard = 0; guard < 100; guard++) {
      const { chunk, nextOffset } = pageOf(body, offset, 120);
      rebuilt += chunk;
      expect((chunk.match(/```/g) ?? []).length % 2).toBe(0);
      if (nextOffset === undefined) break;
      expect(nextOffset).toBeGreaterThan(offset);
      offset = nextOffset;
    }
    expect(rebuilt).toBe(body);
  });
});

describe("parseCursor", () => {
  it("rejects values outside the text", () => {
    expect(() => parseCursor("-1", 10)).toThrow();
    expect(() => parseCursor("11", 10)).toThrow();
    expect(() => parseCursor("abc", 10)).toThrow();
    expect(parseCursor(undefined, 10)).toBe(0);
    expect(parseCursor("4", 10)).toBe(4);
  });
});

describe("draft edits", () => {
  it("replaces one section and keeps the rest", () => {
    const next = replaceSection(
      doc,
      "errors",
      "## Errors\n\n422 on bad input."
    );
    expect(next).toContain("422 on bad input.");
    expect(next).not.toContain("409 on duplicate.");
    expect(next).toContain("Second create section.");
  });

  it("throws with the known ids for an unknown section", () => {
    expect(() => replaceSection(doc, "missing", "x")).toThrow(/orders-api/);
  });

  it("appends with one blank line between parts", () => {
    expect(appendToBody("a\n\n\n", "b")).toBe("a\n\nb");
    expect(appendToBody("", "b")).toBe("b");
  });
});

describe("parseSections — scale", () => {
  it("parses a page of many short headings in linear time", () => {
    const body = Array.from({ length: 60_000 }, (_, i) => `# h${i}`).join("\n");
    const started = performance.now();
    const sections = parseSections(body);
    expect(performance.now() - started).toBeLessThan(500);
    expect(sections).toHaveLength(60_000);
    expect(sections[0]?.end).toBe(sections[1]?.start);
    expect(sections.at(-1)?.end).toBe(body.length);
  });
});

describe("pageOf — oversized structures", () => {
  it("splits a single line longer than the page at the limit", () => {
    const line = "x".repeat(250);
    const first = pageOf(line, 0, 100);
    expect(first.chunk).toHaveLength(100);
    expect(first.nextOffset).toBe(100);
  });
});
