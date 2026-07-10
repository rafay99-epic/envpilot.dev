import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { listWithStatsCore, listForUserCore } from "./helpers";

/**
 * Project Queries and Mutations
 */

// ==========================================
// QUERIES
// ==========================================

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));
  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project?.deletedAt) return null;
    return project;
  },
});

export const getBySlug = query({
  args: {
    organizationId: v.id("organizations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q.eq("organizationId", args.organizationId).eq("slug", args.slug)
      )
      .first();

    if (project?.deletedAt) return null;
    return project;
  },
});

export const listWithStats = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return listWithStatsCore(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
    });
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return listForUserCore(ctx, actor._id);
  },
});
