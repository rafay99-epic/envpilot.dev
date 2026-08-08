// Editing affordances ported from wryte.xyz into src/lib/editor.
//
// These are the parsers that make the markdown textarea feel like an editor
// rather than a form field, and every one of them fails SILENTLY: a broken
// list rule just stops continuing lists, a broken line map just scrolls the
// split view to the wrong block. Nothing throws, so only a test notices.
import { describe, expect, it } from "vitest";

import { listEnterAction, listIndentAction } from "@/lib/editor/lists";
import { parseOutline } from "@/lib/editor/outline";
import { lineOfIndex, lineStartOffset } from "@/lib/editor/source-lines";

describe("listEnterAction", () => {
  const caretAtEnd = (text: string) => listEnterAction(text, text.length);

  it("continues a bullet list", () => {
    expect(caretAtEnd("- first")).toEqual({ type: "continue", insert: "\n- " });
  });

  it("increments an ordered list", () => {
    expect(caretAtEnd("3. third")).toEqual({
      type: "continue",
      insert: "\n4. ",
    });
  });

  it("preserves the ordered delimiter", () => {
    expect(caretAtEnd("1) first")).toEqual({
      type: "continue",
      insert: "\n2) ",
    });
  });

  it("continues a checkbox as unchecked", () => {
    expect(caretAtEnd("- [x] done")).toEqual({
      type: "continue",
      insert: "\n- [ ] ",
    });
  });

  it("continues a blockquote", () => {
    expect(caretAtEnd("> quoted")).toEqual({
      type: "continue",
      insert: "\n> ",
    });
  });

  it("preserves indentation", () => {
    expect(caretAtEnd("  - nested")).toEqual({
      type: "continue",
      insert: "\n  - ",
    });
  });

  it("exits the list on an empty item", () => {
    // The whole point: a second Enter on an empty bullet removes the marker
    // instead of laying down another one forever.
    expect(caretAtEnd("- ")).toEqual({ type: "exit", start: 0, end: 2 });
  });

  it("returns null on a plain paragraph", () => {
    expect(caretAtEnd("just prose")).toBeNull();
  });

  it("returns null when the caret sits inside the marker", () => {
    expect(listEnterAction("- item", 1)).toBeNull();
  });
});

describe("listIndentAction", () => {
  it("indents a list line by two spaces", () => {
    expect(listIndentAction("- item", 6, false)).toEqual({
      lineStart: 0,
      insert: "  ",
    });
  });

  it("outdents an indented list line", () => {
    expect(listIndentAction("  - item", 8, true)).toEqual({
      lineStart: 0,
      remove: 2,
    });
  });

  it("returns null outdenting a flush list line", () => {
    expect(listIndentAction("- item", 6, true)).toBeNull();
  });

  it("returns null on a non-list line", () => {
    expect(listIndentAction("prose", 5, false)).toBeNull();
  });
});

describe("parseOutline", () => {
  it("extracts headings with levels and offsets", () => {
    const body = "# Title\n\nintro\n\n## Section\n\n### Detail\n";
    expect(parseOutline(body)).toEqual([
      { level: 1, text: "Title", start: 0, end: 7 },
      { level: 2, text: "Section", start: 16, end: 26 },
      { level: 3, text: "Detail", start: 28, end: 38 },
    ]);
  });

  it("offsets round-trip to the source text", () => {
    const body = "# Title\n\nintro\n\n## Section\n";
    for (const heading of parseOutline(body)) {
      expect(body.slice(heading.start, heading.end)).toContain(heading.text);
    }
  });

  it("ignores '#' inside fenced code", () => {
    // A shell comment in an API doc must not become a heading.
    const body = "# Real\n\n```bash\n# not a heading\n```\n\n## Also real\n";
    expect(parseOutline(body).map((h) => h.text)).toEqual([
      "Real",
      "Also real",
    ]);
  });

  it("strips closing hashes", () => {
    expect(parseOutline("## Title ##")[0]?.text).toBe("Title");
  });

  it("returns nothing for a body with no headings", () => {
    expect(parseOutline("just prose\n\nmore prose")).toEqual([]);
  });
});

describe("source line mapping", () => {
  const body = "line one\nline two\nline three";

  it("lineOfIndex is 1-indexed", () => {
    expect(lineOfIndex(body, 0)).toBe(1);
    expect(lineOfIndex(body, 9)).toBe(2);
    expect(lineOfIndex(body, 18)).toBe(3);
  });

  it("lineStartOffset inverts lineOfIndex", () => {
    for (let line = 1; line <= 3; line++) {
      const start = lineStartOffset(body, line);
      expect(lineOfIndex(body, start)).toBe(line);
    }
  });

  it("clamps past the end rather than throwing", () => {
    expect(lineOfIndex(body, 10_000)).toBe(3);
    expect(lineStartOffset(body, 99)).toBe(18);
  });
});
