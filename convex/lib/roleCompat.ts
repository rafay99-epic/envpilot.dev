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

// Role slugs are registry-driven (open set) — validators accept any string;
// the registry resolver decides meaning and fails closed on unknowns.
// Published clients normalize unknown slugs to "developer" labels and obey
// the meta booleans, so widening is backward compatible.
export const orgRoleValidator = v.string();
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
