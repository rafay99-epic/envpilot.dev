"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for listing projects in an organization
 */
export function useOrganizationProjects(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.features.projects.queries.listByOrganization,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for getting a project by slug (uses Convex index — single lookup, not fetch-all-and-filter)
 */
export function useProjectBySlug(
  organizationId: Id<"organizations"> | string | undefined,
  slug: string | undefined
) {
  return useQuery(
    api.features.projects.queries.getBySlug,
    organizationId && slug
      ? { organizationId: organizationId as Id<"organizations">, slug }
      : "skip"
  );
}
