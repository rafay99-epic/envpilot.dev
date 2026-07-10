import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { normalizeOrgRole, toLegacyProjectRole } from "../../lib/authz";

/**
 * Shared private helpers for projects queries/mutations.
 */

export async function listWithStatsCore(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  }
) {
  let projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", args.organizationId)
    )
    .collect()
    .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

  // Resolve org membership and project assignments for visibility.
  // Owners see all org projects; everyone else only sees projects they
  // are assigned to via projectMembers.
  let userRole: string | null = null;
  const assignedProjectIds = new Set<string>();

  const userId = args.userId;
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", userId)
    )
    .first();

  // Fail closed: a non-member of this org sees nothing. Previously the
  // visibility filter was skipped when membership was absent, which returned
  // the ENTIRE org project list to any authenticated non-member.
  if (!membership) {
    return [];
  }

  userRole = normalizeOrgRole(membership.role);

  if (normalizeOrgRole(membership.role) !== "owner") {
    // Get user's project assignments
    const projectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const pm of projectMemberships) {
      assignedProjectIds.add(pm.projectId.toString());
    }

    projects = projects.filter((p) => assignedProjectIds.has(p._id.toString()));
  }

  const projectsWithStats = await Promise.all(
    projects.map(async (project) => {
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect()
        .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

      return {
        ...project,
        variableCount: variables.length,
        userRole: userRole as string | null,
        // Legacy compatibility: derived from the unified org role + assignment
        projectRole: userRole
          ? (toLegacyProjectRole(
              normalizeOrgRole(userRole),
              assignedProjectIds.has(project._id.toString())
            ) as string | null)
          : null,
      };
    })
  );

  return projectsWithStats;
}

export async function listForUserCore(ctx: QueryCtx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const allProjects = await Promise.all(
    memberships.map(async (membership) => {
      const orgRole = normalizeOrgRole(membership.role);

      // Owners see all projects in the org
      if (orgRole === "owner") {
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId)
          )
          .collect()
          .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

        return projects.map((project) => ({
          ...project,
          userRole: orgRole as string,
          projectRole: null as string | null,
        }));
      }

      // Everyone else only sees projects they're assigned to
      const projectMemberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const projectsInOrg = await Promise.all(
        projectMemberships.map(async (pm) => {
          const project = await ctx.db.get(pm.projectId);
          if (
            !project ||
            project.deletedAt ||
            project.organizationId !== membership.organizationId
          ) {
            return null;
          }
          return {
            ...project,
            userRole: orgRole as string,
            // Legacy compatibility: derived from the unified org role
            projectRole: toLegacyProjectRole(orgRole, true) as string | null,
          };
        })
      );

      return projectsInOrg.filter(
        (p): p is NonNullable<typeof p> => p !== null
      );
    })
  );

  return allProjects.flat();
}
