import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { verifyAdmin } from "./auth";

export const listContactMessages = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("contactMessages")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const markContactMessageRead = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { isRead: args.isRead });
  },
});

export const deleteContactMessage = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TICKETS
// ==========================================

export const listSupportTickets = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("supportTickets")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const updateSupportTicketStatus = mutation({
  args: {
    secret: v.string(),
    id: v.id("supportTickets"),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
