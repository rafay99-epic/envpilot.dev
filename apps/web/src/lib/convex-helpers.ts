import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id, Doc } from "@convex/_generated/dataModel";

interface WorkOSUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
}

/**
 * Get or create a Convex user from WorkOS user data
 */
export async function getOrCreateConvexUser(
  convex: ConvexHttpClient,
  workosUser: WorkOSUser
): Promise<Doc<"users">> {
  let convexUser = await convex.query(api.users.getByWorkosId, {
    workosId: workosUser.id,
  });

  if (!convexUser) {
    const userId = await convex.mutation(api.users.upsert, {
      workosId: workosUser.id,
      email: workosUser.email,
      name:
        workosUser.firstName && workosUser.lastName
          ? `${workosUser.firstName} ${workosUser.lastName}`.trim()
          : workosUser.firstName || workosUser.lastName || undefined,
      avatarUrl: workosUser.profilePictureUrl || undefined,
    });
    convexUser = await convex.query(api.users.getById, { userId });
  }

  if (!convexUser) {
    throw new Error("Failed to sync user");
  }

  return convexUser;
}

/**
 * Check if the JWT-authenticated caller is a member of an organization
 * (web/session routes). The caller identity is derived server-side inside
 * Convex from the attached WorkOS token, so pass an already-authed client
 * (see createAuthedConvexClient). Returns the membership if found, null
 * otherwise.
 */
export async function checkOrganizationMembership(
  authedConvex: ConvexHttpClient,
  organizationId: Id<"organizations">
): Promise<Doc<"organizationMembers"> | null> {
  return await authedConvex.query(api.organizations.getMembership, {
    organizationId,
  });
}

/**
 * Bearer-path variant for CLI/extension routes: the caller identity is
 * resolved inside Convex from the validated bearer token (cliTokens), so the
 * route passes the raw token it already holds. Returns the membership if
 * found, null otherwise.
 */
export async function checkOrganizationMembershipForToken(
  convex: ConvexHttpClient,
  accessToken: string,
  organizationId: Id<"organizations">
): Promise<Doc<"organizationMembers"> | null> {
  return await convex.query(api.organizations.getMembershipForToken, {
    accessToken,
    organizationId,
  });
}

/**
 * Get the organization that owns a project
 */
export async function getProjectOrganization(
  convex: ConvexHttpClient,
  projectId: Id<"projects">
): Promise<{
  project: Doc<"projects"> | null;
  organizationId: Id<"organizations"> | null;
}> {
  const project = await convex.query(api.projects.getById, { projectId });

  if (!project) {
    return { project: null, organizationId: null };
  }

  return { project, organizationId: project.organizationId };
}
