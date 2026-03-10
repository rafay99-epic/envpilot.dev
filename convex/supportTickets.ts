import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Support Tickets - Public-facing support form
 */

const MAX_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Submit a new support ticket (public, no auth required)
 */
export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    category: v.union(
      v.literal("bug"),
      v.literal("account"),
      v.literal("billing"),
      v.literal("cli"),
      v.literal("extension"),
      v.literal("other")
    ),
    subject: v.string(),
    message: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    if (!args.name.trim() || args.name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `Name must be between 1 and ${MAX_NAME_LENGTH} characters`
      );
    }
    if (!EMAIL_REGEX.test(args.email)) {
      throw new Error("Please provide a valid email address");
    }
    if (!args.subject.trim() || args.subject.length > MAX_SUBJECT_LENGTH) {
      throw new Error(
        `Subject must be between 1 and ${MAX_SUBJECT_LENGTH} characters`
      );
    }
    if (!args.message.trim() || args.message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters`
      );
    }

    const now = Date.now();
    const ticketId = await ctx.db.insert("supportTickets", {
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      category: args.category,
      subject: args.subject.trim(),
      message: args.message.trim(),
      priority: args.priority,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    return ticketId;
  },
});
