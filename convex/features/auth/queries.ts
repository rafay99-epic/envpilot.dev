import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import {
  normalizeOrgRole,
  toLegacyOrgRole,
  toLegacyProjectRole,
  getRoleProfile,
  bypassesAssignment,
  assertNotSuspended,
  isSuspendedMembership,
  effectiveEnvironments,
} from "../../lib/authz";
import { expandActions } from "../../lib/roleProfiles";
import {
  orgRoleValidator,
  legacyOrgRoleValidator,
  legacyProjectRoleValidator,
} from "../../lib/roleCompat";

// ─── Query: getMyPermissions ──────────────────────────────────────────────────
//
// The single endpoint that frontends (web, CLI, extension) call to learn what
// the current user is allowed to do. Returns a flat list of action strings
// (e.g. "org:invite_member", "project:update") that the UI can check with
// `actions.includes("org:invite_member")`.

export const getMyPermissions = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    // Registry-driven role slug (open set — see lib/roleCompat.ts)
    orgRole: v.union(v.string(), v.null()),
    assigned: v.boolean(),
    actions: v.array(v.string()),
    // Full capability map + display metadata so the web renders roles
    // dynamically (badges, gates) without hardcoded slug knowledge.
    capabilities: v.record(v.string(), v.boolean()),
    roleMeta: v.union(
      v.object({
        displayName: v.string(),
        color: v.string(),
        level: v.number(),
      }),
      v.null()
    ),
  }),
  handler: async (ctx, args) => {
    // Actor comes from the verified AuthKit JWT, never from an arg — a caller
    // can no longer ask for someone else's permission set.
    const actor = await requireAuthedUser(ctx);

    // 1. Resolve org membership
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();

    if (!membership || isSuspendedMembership(membership)) {
      // Suspended members present exactly like non-members: no role, no
      // actions. The web hold screen reads status via its own query.
      return {
        orgRole: null,
        assigned: false,
        actions: [] as string[],
        capabilities: {} as Record<string, boolean>,
        roleMeta: null,
      };
    }

    const orgRole = normalizeOrgRole(membership.role);
    // ONE profile resolution per request (cost rule) — everything below
    // derives from it.
    const profile = await getRoleProfile(ctx, orgRole);
    const expanded = expandActions(profile);
    const orgActions: string[] = expanded.orgActions;

    // Project-level actions (if projectId provided)
    let assigned = false;
    let projectActions: string[] = [];

    if (args.projectId) {
      // Verify project exists and is not soft-deleted
      const project = await ctx.db.get(args.projectId);
      if (!project || (project as Record<string, unknown>).deletedAt) {
        return {
          orgRole,
          assigned: false,
          actions: orgActions,
          capabilities: profile.capabilities as Record<string, boolean>,
          roleMeta: {
            displayName: profile.displayName,
            color: profile.color,
            level: profile.level,
          },
        };
      }

      if (bypassesAssignment(profile)) {
        // The owner class gets its project actions implicitly
        projectActions = expanded.projectActions;
      } else {
        const pm = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", args.projectId!).eq("userId", actor._id)
          )
          .first();

        if (pm) {
          assigned = true;
          projectActions = expanded.projectActions;
        }
      }
    }

    return {
      orgRole,
      assigned,
      actions: [...orgActions, ...projectActions],
      capabilities: profile.capabilities as Record<string, boolean>,
      roleMeta: {
        displayName: profile.displayName,
        color: profile.color,
        level: profile.level,
      },
    };
  },
});

// ─── Query: resolveLegacyRoles ────────────────────────────────────────────────
//
// Convex port of the old apps/web/src/app/api/cli/_lib/legacy-roles.ts
// resolveLegacyRoles(). Translates the unified role model back into the legacy
// role strings so the composed value actions (features/variables/values.ts,
// features/variables/requests/) can return the same role `meta` the deleted
// routes did. Lives outside those modules so the value actions can call it via
// ctx.runQuery(api.features.auth.queries.resolveLegacyRoles) without a same-module
// circular type reference.

/**
 * Resolve the caller's unified role + project assignment and translate them
 * into the legacy role strings. Returns the SAME fields the route helper did:
 *   role, legacyRole, assigned, grantOnly, legacyProjectRole, environmentScope
 *
 * Special case preserved: an unassigned user holding an active per-variable
 * grant inside the project is reported as legacyProjectRole "viewer" so old
 * clients apply strict read-only protection.
 */
export const resolveLegacyRoles = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    role: orgRoleValidator,
    legacyRole: legacyOrgRoleValidator,
    assigned: v.boolean(),
    grantOnly: v.boolean(),
    legacyProjectRole: legacyProjectRoleValidator,
    environmentScope: v.union(v.array(v.string()), v.null()),
    // Resolved capability map (additive) — the value actions consume these
    // instead of comparing role slugs.
    capabilities: v.record(v.string(), v.boolean()),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }
    assertNotSuspended(membership);

    const role = normalizeOrgRole(membership.role);

    // The owner class is implicitly assigned to every project.
    const legacyProfile = await getRoleProfile(ctx, role);
    let assigned = bypassesAssignment(legacyProfile);
    // A scoped developer's environment restriction (subset semantics). Only
    // populated for an assigned developer whose projectMembers row sets it.
    let environmentScope: string[] | null = null;
    if (!assigned) {
      const projectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", actor._id)
        )
        .first();
      assigned = projectMembership !== null;
      environmentScope =
        effectiveEnvironments(legacyProfile, projectMembership?.environments) ??
        null;
    }

    let grantOnly = false;
    let legacyProjectRole = toLegacyProjectRole(role, assigned);

    if (!assigned) {
      // Match the old getForUser join: an active, unexpired grant on a
      // non-deleted variable that lives in THIS project makes the caller a
      // grant-only viewer.
      const grants = await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect();
      const now = Date.now();
      for (const grant of grants) {
        if (grant.expiresAt !== undefined && grant.expiresAt <= now) continue;
        const variable = await ctx.db.get(grant.variableId);
        if (!variable || variable.deletedAt) continue;
        if (variable.projectId === args.projectId) {
          grantOnly = true;
          break;
        }
      }
      if (grantOnly) {
        legacyProjectRole = "viewer";
      }
    }

    return {
      role,
      legacyRole: toLegacyOrgRole(role),
      assigned,
      grantOnly,
      legacyProjectRole,
      environmentScope,
      capabilities: legacyProfile.capabilities as Record<string, boolean>,
    };
  },
});
