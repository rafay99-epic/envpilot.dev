import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuthedUser } from "./identity";
import {
  normalizeOrgRole,
  toLegacyOrgRole,
  toLegacyProjectRole,
} from "./authz";

/**
 * Legacy-role compatibility — Stage 3, Phase 2.
 *
 * Convex port of the old apps/web/src/app/api/cli/_lib/legacy-roles.ts
 * resolveLegacyRoles(). Deployed CLI / VS Code extension builds hardcode the
 * pre-migration role strings (org: admin/team_lead/member; project:
 * manager/developer/viewer) and derive OS-level .env file protection from them.
 * This translates the unified role model back into those strings so the
 * composed value actions (convex/variableValues.ts,
 * convex/variableRequests.ts) can return the same role `meta` the deleted
 * routes did.
 *
 * Lives in its own module so the value actions can call it via
 * ctx.runQuery(api.roleCompat.resolveLegacyRoles) without a same-module
 * circular type reference.
 */

export const orgRoleValidator = v.union(
  v.literal("owner"),
  v.literal("project_manager"),
  v.literal("team_lead"),
  v.literal("developer")
);
export const legacyOrgRoleValidator = v.union(
  v.literal("admin"),
  v.literal("team_lead"),
  v.literal("member")
);
export const legacyProjectRoleValidator = v.union(
  v.literal("manager"),
  v.literal("developer"),
  v.literal("viewer"),
  v.null()
);

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

    const role = normalizeOrgRole(membership.role);

    // Owners are implicitly assigned to every project.
    let assigned = role === "owner";
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
      if (role === "developer") {
        environmentScope = projectMembership?.environments ?? null;
      }
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
    };
  },
});
