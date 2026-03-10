import { internalMutation } from "../_generated/server";

/**
 * Migration: Create projectMembers records for existing organization members
 *
 * This ensures existing members don't lose access when project-level
 * filtering is enabled. All current team_leads and members get "developer"
 * role on all existing projects in their organizations.
 *
 * Admins are skipped since they have implicit access to all projects.
 *
 * Run via Convex dashboard: npx convex run migrations/migrateProjectMembers:migrate
 */
export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    // Get all organizations
    const orgs = await ctx.db.query("organizations").collect();

    for (const org of orgs) {
      // Get all non-admin members
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", org._id)
        )
        .collect();

      const nonAdminMembers = members.filter((m) => m.role !== "admin");

      if (nonAdminMembers.length === 0) continue;

      // Get all active projects in this org
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", org._id)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      if (projects.length === 0) continue;

      for (const member of nonAdminMembers) {
        for (const project of projects) {
          // Check if already exists (idempotent)
          const existing = await ctx.db
            .query("projectMembers")
            .withIndex("by_project_and_user", (q) =>
              q
                .eq("projectId", project._id)
                .eq("userId", member.userId)
            )
            .first();

          if (existing) {
            skipped++;
            continue;
          }

          await ctx.db.insert("projectMembers", {
            projectId: project._id,
            userId: member.userId,
            role: "developer",
            addedBy: member.invitedBy ?? member.userId,
            addedAt: now,
          });
          created++;
        }
      }
    }

    return {
      message: `Migration complete: ${created} project memberships created, ${skipped} skipped (already existed)`,
      created,
      skipped,
    };
  },
});
