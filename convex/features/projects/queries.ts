import { v } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { activeProjectsQuery, isWorkspace } from "../../lib/projectKind";
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

/**
 * Whether `userId` may see `project`: active org membership required, and
 * roles without the assignment bypass need an explicit projectMembers row.
 * Mirrors listWithStatsCore's visibility rule.
 */
async function canViewProject(
  ctx: Parameters<typeof getActiveMembership>[0],
  userId: Id<"users">,
  project: Doc<"projects">
): Promise<boolean> {
  const membership = await getActiveMembership(
    ctx,
    project.organizationId,
    userId
  );
  if (!membership) return false;

  const profile = await getRoleProfile(ctx, membership.role);
  if (bypassesAssignment(profile)) return true;

  const assignment = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", project._id).eq("userId", userId)
    )
    .first();
  return assignment !== null;
}

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Same visibility rule as listWithStatsCore: non-members see nothing,
    // roles without the assignment bypass only see assigned projects.
    // Membership resolves FIRST so a non-member never triggers the full
    // per-org table read.
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];

    const profile = await getRoleProfile(ctx, membership.role);

    if (bypassesAssignment(profile)) {
      // Trashed projects are skipped at the index, not read and discarded —
      // a long-lived org's trash used to dominate this read.
      // activeProjectsQuery, not the plain deleted-at range: workspaces are
      // project rows and must never surface as projects in a grid, a picker
      // or `envpilot list projects`.
      return await activeProjectsQuery(ctx.db, args.organizationId).collect();
    }

    // Assignment-scoped roles read only their own rows: this grows with the
    // caller's assignments rather than with the whole organization.
    const assignments = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    const assigned = await Promise.all(
      assignments.map((assignment) => ctx.db.get(assignment.projectId))
    );

    return assigned.filter(
      (project): project is NonNullable<typeof project> =>
        project !== null &&
        project.deletedAt === undefined &&
        !isWorkspace(project) &&
        project.organizationId === args.organizationId
    );
  },
});

/**
 * Bare id lookup with NO user-identity check — for machine surfaces and
 * convex-internal actions that carry their own authorization. Dashboard
 * and web API-route callers must use getById, which enforces membership.
 */
export const _getById = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project?.deletedAt) return null;
    return project;
  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return null;

    // Returns null instead of throwing so callers keep "not found" handling.
    if (!(await canViewProject(ctx, actor._id, project))) return null;
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

/**
 * Bare org+slug lookup with NO user-identity check — for machine surfaces
 * (public API / MCP actions) that have already authorized the request via
 * _authorizeRequest and re-check project scope afterwards. Dashboard
 * clients must use getBySlug, which enforces membership + assignment.
 */
export const _getBySlug = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_slug_deleted", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("slug", args.slug)
          .eq("deletedAt", undefined)
      )
      .first();

    if (!project) return null;
    // A workspace is not addressable by a machine surface. Returning null
    // rather than throwing keeps the existing policy: never confirm to a key
    // that something exists when it is not in that key's world.
    if (isWorkspace(project)) return null;
    return project;
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
    // A workspace has its own route and query. The project page must not
    // render it with a settings tab, members and CI keys it never asked for.
    if (isWorkspace(project)) return null;

    // Returns null instead of throwing so callers keep "not found" handling.
    if (!(await canViewProject(ctx, actor._id, project))) return null;
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
