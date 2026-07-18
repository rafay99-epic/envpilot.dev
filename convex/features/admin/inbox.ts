import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";

export const listContactMessages = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("contactMessages")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const markContactMessageRead = mutation({
  args: {
    id: v.id("contactMessages"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { isRead: args.isRead });
  },
});

export const deleteContactMessage = mutation({
  args: {
    id: v.id("contactMessages"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TICKETS
// ==========================================

export const listSupportTickets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("supportTickets")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const updateSupportTicketStatus = mutation({
  args: {
    id: v.id("supportTickets"),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
