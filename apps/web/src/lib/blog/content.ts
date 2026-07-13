import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import matter from "gray-matter";
import { createLogger } from "@/lib/logger";
import {
  blogFrontmatterSchema,
  type BlogPost,
  type BlogPostMeta,
} from "./schema";

const log = createLogger("lib/blog/content");
const CONTENT_DIR = resolve(process.cwd(), "content/blog");

/**
 * Gray-matter auto-converts YAML dates to Date objects. Normalize them
 * back to YYYY-MM-DD strings so the Zod schema passes.
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

/**
 * Parse and validate frontmatter from raw MDX text.
 */
function parseFrontmatter(
  slug: string,
  raw: string
): (BlogPostMeta & { content: string }) | null {
  try {
    const { data, content: body } = matter(raw);
    const normalized = normalizeDates(data) as Record<string, unknown>;
    const parsed = blogFrontmatterSchema.safeParse(normalized);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      log.error("frontmatter_validation_failed", { slug, issues });
      return null;
    }

    return {
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      date: parsed.data.date,
      tags: parsed.data.tags,
      keywords: parsed.data.keywords,
      author: parsed.data.author,
      coverImage: parsed.data.coverImage ?? undefined,
      content: body,
    };
  } catch (error) {
    log.error("post_parse_failed", { slug }, error);
    return null;
  }
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = resolve(CONTENT_DIR, `${slug}.mdx`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(slug, raw);
    if (!parsed) return null;
    const { content, ...meta } = parsed;
    return { ...meta, content };
  } catch (error) {
    log.error("post_load_failed", { slug }, error);
    return null;
  }
}

export function getAllPosts(): BlogPostMeta[] {
  if (!existsSync(CONTENT_DIR)) return [];

  const slugs = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => basename(f, ".mdx"));

  const posts: BlogPostMeta[] = [];
  for (const slug of slugs) {
    try {
      const raw = readFileSync(resolve(CONTENT_DIR, `${slug}.mdx`), "utf-8");
      const parsed = parseFrontmatter(slug, raw);
      if (parsed) {
        const { content: _, ...meta } = parsed;
        posts.push(meta);
      }
    } catch (error) {
      log.error("post_metadata_failed", { slug }, error);
    }
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Returns a map of tag → count, computed from the post list.
 * More efficient than calling getAllTags separately.
 */
export function getTagCounts(posts: BlogPostMeta[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
