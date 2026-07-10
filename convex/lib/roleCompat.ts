import { v } from "convex/values";

/**
 * Legacy-role compatibility validators — Stage 3, Phase 2.
 *
 * Deployed CLI / VS Code extension builds hardcode the pre-migration role
 * strings (org: admin/team_lead/member; project: manager/developer/viewer)
 * and derive OS-level .env file protection from them. These validators shape
 * the translation layer's return values (see features/auth/queries.ts →
 * resolveLegacyRoles).
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
