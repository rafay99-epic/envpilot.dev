import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import {
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
} from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
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

/**
 * Effective unsync-on-close for the CALLER on this project:
 * member override ?? project default ?? true. The pro gate
 * (vscode_unsync_customization) is re-checked at read time — when it's not
 * allowed, stored customizations are ignored and the secure default (true)
 * applies, so a pro→free downgrade re-locks everyone immediately.
 */
export const resolveUnsyncOnClose = query({
  args: { projectId: v.id("projects") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return true;

    // Non-members get the platform default — the same answer as a missing
    // project, so this public query neither confirms a project exists nor
    // leaks its settings across org boundaries.
    const orgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!orgMembership) return true;

    const gate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "vscode_unsync_customization"
    );
    if (!gate.allowed) return true;

    const member = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", actor._id)
      )
      .first();

    return (
      member?.vscodeAutoUnsyncOnClose ?? project.vscodeAutoUnsyncOnClose ?? true
    );
  },
});

export const getBySlug = query({
  args: {
    organizationId: v.id("organizations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q.eq("organizationId", args.organizationId).eq("slug", args.slug)
      )
      .first();

    if (!project || project.deletedAt) return null;

    // Visibility mirrors listWithStatsCore: non-members (and suspended
    // members) see nothing; roles without the assignment bypass must hold a
    // projectMembers row. Returns null instead of throwing so callers keep
    // their "not found" handling.
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return null;

    const profile = await getRoleProfile(ctx, membership.role);
    if (!bypassesAssignment(profile)) {
      const assignment = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", actor._id)
        )
        .first();
      if (!assignment) return null;
    }

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
