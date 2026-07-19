import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { cache } from "react";
import matter from "gray-matter";

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  icon: string;
  version?: string;
  content: string; // raw MDX body (no frontmatter)
}

// Content lives at the app root → apps/docs/content/
const CONTENT_DIR = resolve(process.cwd(), "content");

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
 *
 * Wrapped in React cache() so generateMetadata, the page body, and
 * prev/next lookups within one request parse each file exactly once.
 */
export const getDocBySlug = cache(function getDocBySlug(
  slug: string
): DocPage | null {
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
    console.error("[docs/content] doc_load_failed", slug, error);
    return null;
  }
});

/** Ordered slugs for every doc page on disk. */
function getSortedSlugs(): string[] {
  // Ordered explicitly so the sidebar has a logical flow
  const order = [
    "getting-started",
    "cli",
    "extension",
    "web-dashboard",
    "security",
    "rbac",
    // Guides — SEO entry points targeting problem-first searches
    "share-environment-variables-securely",
    "nextjs-environment-variables",
    // Public API, MCP server, and CI/CD integrations
    "api-quickstart",
    "api-reference",
    "architecture",
    "mcp-server",
    "github-action",
    "api-security",
    "rate-limits",
  ];

  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => basename(f, ".mdx"));

  // Ensure ordered slugs come first, then any extras alphabetically
  return [
    ...order.filter((s) => files.includes(s)),
    ...files.filter((s) => !order.includes(s)).sort(),
  ];
}

/**
 * Every doc page including its MDX body — one read+parse per file
 * (shared with getDocBySlug via cache()).
 */
export const getAllDocsFull = cache(function getAllDocsFull(): DocPage[] {
  return getSortedSlugs()
    .map((slug) => getDocBySlug(slug))
    .filter((doc): doc is DocPage => doc !== null);
});

/**
 * Return metadata for every doc page (for the sidebar and static params).
 */
export const getAllDocs = cache(function getAllDocs(): Omit<
  DocPage,
  "content"
>[] {
  return getAllDocsFull().map(({ content: _content, ...meta }) => meta);
});
