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
  category: string; // sidebar group label, derived from CATEGORIES
  content: string; // raw MDX body (no frontmatter)
}

/**
 * Single source of truth for the sidebar's information architecture:
 * group labels, group order, and page order within each group. A page on
 * disk that isn't listed here still renders — it lands in "More" at the
 * bottom — so adding a doc never silently hides it.
 */
export const CATEGORIES: { label: string; slugs: string[] }[] = [
  {
    label: "Start Here",
    slugs: ["getting-started", "architecture", "plans"],
  },
  {
    label: "Clients",
    slugs: ["cli", "extension", "web-dashboard"],
  },
  {
    label: "Platform",
    slugs: [
      "rbac",
      "security",
      "sharing",
      "shared-accounts",
      "variable-lifecycle",
    ],
  },
  {
    label: "API & Integrations",
    slugs: [
      "api-quickstart",
      "api-reference",
      "api-security",
      "mcp-server",
      "github-action",
      "notifications",
      "rate-limits",
    ],
  },
  {
    label: "Guides",
    slugs: [
      "share-environment-variables-securely",
      "nextjs-environment-variables",
    ],
  },
];

const CATEGORY_BY_SLUG = new Map(
  CATEGORIES.flatMap(({ label, slugs }) => slugs.map((slug) => [slug, label]))
);

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
      category: CATEGORY_BY_SLUG.get(slug) ?? "More",
      content: interpolate(content, data),
    };
  } catch (error) {
    console.error("[docs/content] doc_load_failed", slug, error);
    return null;
  }
});

/** Ordered slugs for every doc page on disk — CATEGORIES order, then extras. */
function getSortedSlugs(): string[] {
  const order = CATEGORIES.flatMap((c) => c.slugs);

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
