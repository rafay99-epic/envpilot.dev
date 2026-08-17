import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { api } from "../../_generated/api";

/**
 * Variable-change notifications, fanned out from the backend.
 *
 * Replaces `notifyVariableChange` in apps/web/src/app/api/variables/route.ts,
 * which had two problems the route shape made unavoidable:
 *
 *   1. It was called WITHOUT await, immediately before the handler returned.
 *      On a serverless host the instance can freeze once the response is
 *      written, so whether the mail actually went out depended on how long
 *      the platform kept it warm. Scheduling from a mutation is durable: the
 *      transaction commits the scheduled call or neither happens.
 *   2. It fanned out per variable, so a batch multiplied by the member count.
 *      A 48-variable template in a 5-member org queued 240 emails for one
 *      click. One summary per member instead.
 */
export const notifyBatchCreated = internalMutation({
  args: {
    projectId: v.id("projects"),
    actorId: v.id("users"),
    count: v.number(),
    changeType: v.optional(v.union(v.literal("created"), v.literal("updated"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.count <= 0) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const actor = await ctx.db.get(args.actorId);
    const changedByName = actor?.name || actor?.email || "A team member";

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    for (const member of members) {
      if (member.userId === args.actorId) continue;
      const user = await ctx.db.get(member.userId);
      if (!user?.email) continue;

      // The email action re-checks the recipient's notification preference,
      // so this stays a pure fan-out with no preference logic duplicated.
      await ctx.scheduler.runAfter(
        0,
        api.features.emails.emails.sendVariableBatchEmail,
        {
          userId: user._id,
          to: user.email,
          projectName: project.name,
          changedByName,
          count: args.count,
          changeType: args.changeType ?? "created",
        }
      );
    }

    return null;
  },
});
