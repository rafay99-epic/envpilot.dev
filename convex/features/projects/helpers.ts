import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  bypassesAssignment,
  getActiveMembership,
  getRoleProfile,
  isSuspendedMembership,
  normalizeOrgRole,
  toLegacyProjectRole,
} from "../../lib/authz";

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
    .withIndex("by_organization_and_deleted_at", (q) =>
      q.eq("organizationId", args.organizationId).eq("deletedAt", undefined)
    )
    .collect();

  // Resolve org membership and project assignments for visibility.
  // Owners see all org projects; everyone else only sees projects they
  // are assigned to via projectMembers.
  let userRole: string | null = null;
  const assignedProjectIds = new Set<string>();

  const userId = args.userId;
  const membership = await getActiveMembership(
    ctx,
    args.organizationId,
    userId
  );

  if (!membership) {
    return [];
  }

  userRole = normalizeOrgRole(membership.role);

  const viewerProfile = await getRoleProfile(ctx, membership.role);
  if (!bypassesAssignment(viewerProfile)) {
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

  // Per-project variable count. This query is subscribed by three list
  // pages and re-runs on every variable write, so the count read must stay
  // small: the by_project_deleted index skips soft-deleted rows entirely
  // (trash previously dominated the read — hundreds of dead docs per
  // project), and the take() bounds pathological projects. Counts clamp at
  // the cap; a project card reading "500" instead of its true 5-digit count
  // is an acceptable display approximation for a bounded reactive read.
  const VARIABLE_COUNT_CAP = 500;
  const projectsWithStats = await Promise.all(
    projects.map(async (project) => {
      const activeVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .take(VARIABLE_COUNT_CAP);

      return {
        ...project,
        variableCount: activeVariables.length,
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
  // Suspended orgs contribute no projects — the user is frozen there. The org
  // itself still appears in the switcher (organizations.listForUser) so the
  // hold screen can render.
  const memberships = (
    await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).filter((m) => !isSuspendedMembership(m));

  const allProjects = await Promise.all(
    memberships.map(async (membership) => {
      const orgRole = normalizeOrgRole(membership.role);

      // Owners see all projects in the org
      if (bypassesAssignment(await getRoleProfile(ctx, orgRole))) {
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
