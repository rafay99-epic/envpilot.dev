import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Resolves an organization slug to its Convex document, returning the org and its ID.
 * Returns null if the organization is not found.
 */
export async function resolveOrgBySlug(convex: ConvexHttpClient, slug: string) {
  const org = await convex.query(api.features.organizations.queries.getBySlug, {
    slug,
  });
  if (!org) return null;
  return { organization: org, organizationId: org._id as Id<"organizations"> };
}
