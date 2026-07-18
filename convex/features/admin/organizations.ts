import { query } from "../../_generated/server";
import { requireAdmin } from "./auth";

export const listOrganizations = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const organizations = await ctx.db
      .query("organizations")
      .order("desc")
      .take(500);

    const results = [];
    for (const org of organizations) {
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      const projects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      // Resolve tier from org owner's userTiers record
      const ownerTier = await ctx.db
        .query("userTiers")
        .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
        .first();

      results.push({
        ...org,
        memberCount: members.length,
        projectCount: projects.length,
        tier: ownerTier?.tier ?? "free",
      });
    }

    return results;
  },
});
