import { z } from "zod";

export const CHANGELOG_TYPES = [
  "feature",
  "fix",
  "improvement",
  "security",
  "breaking",
] as const;

export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

/**
 * Frontmatter for one changelog entry inside content/CHANGELOG.md.
 * Mirrors the blog's frontmatter contract: strict object, loud failure,
 * so a typo drops one entry with a logged reason instead of rendering
 * a half-parsed card.
 */
export const changelogFrontmatterSchema = z.strictObject({
  title: z
    .string()
    .min(1, "Entry title is required")
    .max(200, "Title must be ≤200 characters"),
  version: z
    .string()
    .regex(/^v\d+\.\d+\.\d+$/, "Version must look like v1.2.3"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  types: z
    .array(z.enum(CHANGELOG_TYPES))
    .min(1, "At least one type is required"),
});

/** Parsed entry, body still raw MDX. The page compiles it. */
export interface ChangelogEntry {
  /** Stable anchor/key. Versions repeat across entries; version+title does not. */
  id: string;
  version: string;
  title: string;
  date: string;
  publishedAt: number;
  types: ChangelogType[];
  content: string;
}
