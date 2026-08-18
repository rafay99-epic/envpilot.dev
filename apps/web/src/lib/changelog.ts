import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import {
  changelogFrontmatterSchema,
  type ChangelogEntry,
} from "./changelog-schema";

const FILE = resolve(process.cwd(), "content/CHANGELOG.md");

/** Entries are separated by this marker; each block then starts with YAML. */
const ENTRY_MARKER = /^<!-- entry -->$/m;

/**
 * Gray-matter auto-converts YAML dates to Date objects. Normalize back to
 * YYYY-MM-DD so the Zod schema passes (same fix the blog loader carries).
 */
function normalizeDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeDates(v);
    }
    return out;
  }
  return value;
}

/** Lowercase, hyphenated, ASCII-only — same shape the docs headings use. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseEntry(block: string, index: number): ChangelogEntry | null {
  try {
    // gray-matter only recognises the `---` fence at offset 0, and splitting
    // on the entry marker leaves a leading newline on every block.
    const { data, content } = matter(block.trimStart());
    const parsed = changelogFrontmatterSchema.safeParse(normalizeDates(data));

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.error("[changelog] frontmatter_validation_failed", {
        index,
        issues,
      });
      return null;
    }

    return {
      id: `${parsed.data.version}-${slugify(parsed.data.title)}`,
      version: parsed.data.version,
      title: parsed.data.title,
      date: parsed.data.date,
      publishedAt: Date.parse(`${parsed.data.date}T12:00:00Z`),
      types: [...parsed.data.types],
      content: content.trim(),
    };
  } catch (error) {
    console.error("[changelog] entry_parse_failed", { index }, error);
    return null;
  }
}

/**
 * Every changelog entry, newest first.
 *
 * One file, read once at build time. cache() shares the parse between
 * generateMetadata and the page body.
 */
export const getChangelog = cache(function getChangelog(): ChangelogEntry[] {
  if (!existsSync(FILE)) {
    console.error("[changelog] file_missing", { file: FILE });
    return [];
  }

  const raw = readFileSync(FILE, "utf-8");

  return raw
    .split(ENTRY_MARKER)
    .slice(1) // drop the file header comment
    .map(parseEntry)
    .filter((entry): entry is ChangelogEntry => entry !== null)
    .sort((a, b) => b.publishedAt - a.publishedAt);
});
