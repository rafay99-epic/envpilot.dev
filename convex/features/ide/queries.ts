import { query } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthedUser } from "../../lib/identity";
import { getActiveMembership } from "../../lib/authz";
import type { Id } from "../../_generated/dataModel";

/**
 * Lightweight change signal for IDE real-time sync: the max updatedAt across
 * a project's active variables and files. Authenticated + membership-checked;
 * contains no secrets. Clients subscribe over the Convex WebSocket and pull
 * via their normal data plane when this changes.
 */
export const projectVersion = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const membership = await getActiveMembership(
      ctx,
      project.organizationId as Id<"organizations">,
      user._id
    );
    if (!membership) return null;

    let latest = 0;
    for (const row of await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .collect()) {
      latest = Math.max(latest, row.updatedAt);
    }
    for (const row of await ctx.db
      .query("projectFiles")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .collect()) {
      latest = Math.max(latest, row.updatedAt);
    }
    return latest;
  },
});
