import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import matter from "gray-matter";
import {
  blogFrontmatterSchema,
  type BlogPost,
  type BlogPostMeta,
} from "./schema";

const CONTENT_DIR = resolve(process.cwd(), "content");

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

/** `Math.max(1, Math.ceil(words / 200))` minutes, from the MDX body. */
function computeReadingTime(content: string): string {
  const words = content.split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
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
      console.error("[blog/content] frontmatter_validation_failed", {
        slug,
        issues,
      });
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
      readingTime: computeReadingTime(body),
      content: body,
    };
  } catch (error) {
    console.error("[blog/content] post_parse_failed", { slug }, error);
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
    console.error("[blog/content] post_load_failed", { slug }, error);
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
      console.error("[blog/content] post_metadata_failed", { slug }, error);
    }
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
