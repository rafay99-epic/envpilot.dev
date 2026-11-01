import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";
import { internal } from "../../_generated/api";
import {
  MCP_KEYS_RETIRED_SETTING,
  NOTICES_STARTED_SETTING,
} from "../../lib/mcpRetirement";

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

    // The MCP OAuth migration (lib/mcpRetirement.ts). The first time it
    // turns on, tell everyone who manages an MCP key; later toggles only
    // flip enforcement.
    if (args.key === MCP_KEYS_RETIRED_SETTING && args.value === "true") {
      const started = await ctx.db
        .query("adminSettings")
        .withIndex("by_key", (q) => q.eq("key", NOTICES_STARTED_SETTING))
        .first();
      if (!started) {
        const now = Date.now();
        await ctx.db.insert("adminSettings", {
          key: NOTICES_STARTED_SETTING,
          value: String(now),
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.features.api.mcpRetirement.buildNotices,
          { cursor: null }
        );
      }
    }

    // Audit log for sensitive setting changes
    if (
      args.key === "tierEnforcement" ||
      args.key === "paymentsEnabled" ||
      args.key === MCP_KEYS_RETIRED_SETTING
    ) {
      console.warn(
        `[SECURITY AUDIT] Admin setting toggled: key=${args.key}, value=${args.value}, previousValue=${previousValue}, timestamp=${new Date().toISOString()}`
      );
    }
  },
});
