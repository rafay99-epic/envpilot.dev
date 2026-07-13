import { z } from "zod";

export const blogFrontmatterSchema = z
  .object({
    title: z
      .string()
      .min(1, "Blog post title is required")
      .max(200, "Title must be ≤200 characters"),
    description: z
      .string()
      .min(1, "Description (excerpt) is required")
      .max(500, "Description must be ≤500 characters"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
    tags: z.array(z.string().min(1)).min(1, "At least one tag is required"),
    keywords: z.array(z.string().min(1)).default([]),
    author: z.object({
      name: z.string().min(1, "Author name is required"),
    }),
    coverImage: z.string().optional(),
  })
  .strict();

/**
 * Full blog post shape (includes raw MDX body).
 * Separate from the schema because the body is not validated by Zod.
 */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  keywords: string[];
  author: { name: string };
  coverImage?: string;
  content: string;
}

/**
 * Metadata-only shape (no MDX body) — used for listing pages,
 * sitemaps, and RSS feeds.
 */
export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  keywords: string[];
  author: { name: string };
  coverImage?: string;
}
