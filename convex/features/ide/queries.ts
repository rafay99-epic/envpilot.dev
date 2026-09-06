import { query } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthedUser } from "../../lib/identity";
import { getActiveMembership } from "../../lib/authz";
import type { Id } from "../../_generated/dataModel";
import { resolveEffectiveVariables } from "../variables/resolve";

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

    // Link and unlink touch the project row, so membership changes move
    // the version even when every shared row is older than the project.
    let latest = project.updatedAt;
    // Resolved, not own rows only: an edit to a workspace variable has to
    // move every linked project's version or the IDE never re-pulls it.
    for (const row of await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
    })) {
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
