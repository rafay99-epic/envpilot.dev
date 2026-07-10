import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Changelog entry type
 */
export interface ChangelogEntry {
  _id: Id<"changelog">;
  _creationTime: number;
  title: string;
  content: string;
  version: string;
  type: "feature" | "fix" | "improvement" | "security" | "breaking";
  isPublished: boolean;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hook to fetch published changelog entries
 */
export function useChangelogEntries(limit?: number) {
  const entries = useQuery(
    api.features.community.changelog.queries.listPublished,
    { limit }
  );
  return {
    entries,
    isLoading: entries === undefined,
  };
}

/**
 * Hook to fetch a single changelog entry by ID
 */
export function useChangelogEntry(id: Id<"changelog"> | undefined) {
  const entry = useQuery(
    api.features.community.changelog.queries.getById,
    id ? { id } : "skip"
  );
  return {
    entry,
    isLoading: entry === undefined,
  };
}

/**
 * Hook to fetch a changelog entry by version
 */
export function useChangelogByVersion(version: string | undefined) {
  const entry = useQuery(
    api.features.community.changelog.queries.getByVersion,
    version ? { version } : "skip"
  );
  return {
    entry,
    isLoading: entry === undefined,
  };
}

/**
 * Hook to fetch changelog entries filtered by type
 */
export function useChangelogByType(
  type: "feature" | "fix" | "improvement" | "security" | "breaking" | undefined,
  limit?: number
) {
  const entries = useQuery(
    api.features.community.changelog.queries.listByType,
    type ? { type, limit } : "skip"
  );
  return {
    entries,
    isLoading: entries === undefined,
  };
}

/**
 * Hook to fetch all unique versions
 */
export function useChangelogVersions() {
  const versions = useQuery(
    api.features.community.changelog.queries.listVersions,
    {}
  );
  return {
    versions,
    isLoading: versions === undefined,
  };
}
