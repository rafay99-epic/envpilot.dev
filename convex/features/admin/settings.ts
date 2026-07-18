import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";

export const getAdminSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const settings = await ctx.db.query("adminSettings").collect();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  },
});

export const updateAdminSetting = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    const previousValue = existing?.value ?? null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }

    // Audit log for sensitive setting changes
    if (args.key === "tierEnforcement" || args.key === "paymentsEnabled") {
      console.warn(
        `[SECURITY AUDIT] Admin setting toggled: key=${args.key}, value=${args.value}, previousValue=${previousValue}, timestamp=${new Date().toISOString()}`
      );
    }
  },
});
