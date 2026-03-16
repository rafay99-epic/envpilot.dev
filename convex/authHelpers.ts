import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type OrgRole = "admin" | "team_lead" | "member";
type ProjectRole = "manager" | "developer" | "viewer";

/**
 * Authorize a user for a variable operation.
 *
 * Verifies: (1) user exists, (2) user is a member of the org,
 * (3) user has a permitted org role OR a permitted project role.
 *
 * Admins and team_leads pass at the org level without needing a
 * project membership record. Members must have an explicit
 * projectMembers entry with a permitted project role.
 */
export async function authorizeVariableAccess(
  ctx: MutationCtx | QueryCtx,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    requiredOrgRoles: OrgRole[];
    requiredProjectRoles?: ProjectRole[];
  }
): Promise<void> {
  // 1. Verify user exists
  const user = await ctx.db.get(args.userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  // 2. Verify org membership
  const orgMembership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", args.userId)
    )
    .first();

  if (!orgMembership) {
    throw new Error("Not authorized");
  }

  // 3. Check org role — admins/team_leads pass immediately
  if (args.requiredOrgRoles.includes(orgMembership.role as OrgRole)) {
    return;
  }

  // 4. For members: check project-level role
  if (!args.requiredProjectRoles || args.requiredProjectRoles.length === 0) {
    throw new Error("Insufficient permissions");
  }

  const projectMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", args.projectId).eq("userId", args.userId)
    )
    .first();

  if (!projectMembership) {
    throw new Error("Insufficient permissions");
  }

  if (
    args.requiredProjectRoles.includes(projectMembership.role as ProjectRole)
  ) {
    return;
  }

  throw new Error("Insufficient permissions");
}
