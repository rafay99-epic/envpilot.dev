import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import matter from "gray-matter";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/docs/content");

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  icon: string;
  version?: string;
  content: string; // raw MDX body (no frontmatter)
}

// Content lives two levels above src/ → apps/web/content/docs/
const CONTENT_DIR = resolve(process.cwd(), "content/docs");

/**
 * Interpolate frontmatter variables into the MDX body.
 *
 * Supports `{{key}}` syntax — e.g. `{{version}}` is replaced with
 * the `version` value from frontmatter. This lets the generation
 * script write version numbers once in the frontmatter, and the
 * content references them without hardcoding.
 */
function interpolate(content: string, vars: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value != null ? String(value) : match;
  });
}

/**
 * Read and parse a single MDX file by slug.
 */
export function getDocBySlug(slug: string): DocPage | null {
  try {
    const raw = readFileSync(resolve(CONTENT_DIR, `${slug}.mdx`), "utf-8");
    const { data, content } = matter(raw);
    return {
      slug,
      title: (data.title as string) ?? slug,
      description: (data.description as string) ?? "",
      icon: (data.icon as string) ?? "file-text",
      version: (data.version as string) ?? undefined,
      content: interpolate(content, data),
    };
  } catch (error) {
    log.error("doc_load_failed", { slug }, error);
    return null;
  }
}

/**
 * Return metadata for every doc page (for the sidebar and static params).
 */
export function getAllDocs(): Omit<DocPage, "content">[] {
  // Ordered explicitly so the sidebar has a logical flow
  const order = [
    "getting-started",
    "cli",
    "extension",
    "web-dashboard",
    "security",
    "rbac",
  ];

  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => basename(f, ".mdx"));

  // Ensure ordered slugs come first, then any extras alphabetically
  const sorted = [
    ...order.filter((s) => files.includes(s)),
    ...files.filter((s) => !order.includes(s)).sort(),
  ];

  return sorted.map((slug) => {
    const raw = readFileSync(resolve(CONTENT_DIR, `${slug}.mdx`), "utf-8");
    const { data } = matter(raw);
    return {
      slug,
      title: (data.title as string) ?? slug,
      description: (data.description as string) ?? "",
      icon: (data.icon as string) ?? "file-text",
      version: (data.version as string) ?? undefined,
    };
  });
}
