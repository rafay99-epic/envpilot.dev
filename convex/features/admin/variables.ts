import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";

/**
 * Update expiry time on a variable — for testing rotation workflows.
 */
export const updateVariableExpiry = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    expiresAt: v.number(),
    rotationStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expiring_soon"),
        v.literal("expired")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const variable = await ctx.db.get(args.variableId);
    if (!variable) throw new Error("Variable not found");
    if (!variable.rotationFrequencyDays) {
      throw new Error("Variable does not have rotation enabled");
    }

    await ctx.db.patch(args.variableId, {
      expiresAt: args.expiresAt,
      rotationStatus: args.rotationStatus ?? variable.rotationStatus,
      lastReminderSentAt: undefined, // Reset so reminders fire again
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * List all rotation-enabled variables across the system (admin view).
 */
export const listRotationVariables = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Fetch all non-deleted variables and filter in JS —
    // Convex filters on optional fields can be unreliable with undefined checks
    const allVariables = await ctx.db
      .query("environmentVariables")
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    const variables = allVariables.filter(
      (v) =>
        v.rotationFrequencyDays !== undefined && v.rotationFrequencyDays > 0
    );

    const results = [];
    for (const variable of variables) {
      const project = await ctx.db.get(variable.projectId);
      results.push({
        _id: variable._id,
        key: variable.key,
        projectName: project?.name ?? "Unknown",
        rotationFrequencyDays: variable.rotationFrequencyDays!,
        expiresAt: variable.expiresAt!,
        rotationStatus: variable.rotationStatus ?? "active",
        lastReminderSentAt: variable.lastReminderSentAt,
      });
    }

    return results.sort((a, b) => a.expiresAt - b.expiresAt);
  },
});
