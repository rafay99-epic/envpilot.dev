// Legacy-role compatibility layer for already-installed VS Code extension builds.
//
// Old extension builds hardcode the pre-migration role strings (org: admin /
// team_lead / member; project: manager / developer / viewer) and derive
// OS-level .env file protection from them. These routes translate the
// unified role model (see @/lib/roles and convex/authz.ts) back into those
// strings so deployed clients keep protecting files correctly.
//
// NOTE: apps/web/src/app/api/cli/_lib/legacy-roles.ts is an identical copy
// for the CLI routes — keep the two files in sync.

import type { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  normalizeOrgRole,
  toLegacyOrgRole,
  toLegacyProjectRole,
  type LegacyOrgRole,
  type LegacyProjectRole,
  type OrgRole,
} from "@/lib/roles";

export interface ResolvedLegacyRoles {
  /** Unified role after normalizing legacy DB values. */
  role: OrgRole;
  /** Legacy org role string for old CLI / extension builds. */
  legacyRole: LegacyOrgRole;
  /** True when the user is assigned to the project (owners always count). */
  assigned: boolean;
  /**
   * True when the user has NO project assignment but holds an active
   * per-variable permission grant inside the project (viewer sharing).
   */
  grantOnly: boolean;
  /**
   * Legacy project role string for old CLI / extension builds:
   * owner/project_manager/team_lead (assigned) → "manager",
   * developer (assigned) → "developer", grant-only → "viewer",
   * otherwise null.
   */
  legacyProjectRole: LegacyProjectRole | null;
  /**
   * Unified-model environment scope for the caller on this project. Only a
   * scoped developer has a non-null value (the subset of environments their
   * projectMembers row restricts them to). null means unrestricted, or that
   * the caller's role is not developer / has no assignment. New extension
   * builds use this to know production or other envs may have been withheld.
   */
  environmentScope: string[] | null;
}

/**
 * Resolve a user's unified role + project assignment and translate them into
 * the legacy role strings old clients understand.
 *
 * Special case: a user with no project assignment but an active
 * variablePermissions grant is reported as projectRole "viewer" so old
 * clients apply strict read-only protection to the .env file.
 */
export async function resolveLegacyRoles(
  convex: ConvexHttpClient,
  args: {
    userId: Id<"users">;
    projectId: Id<"projects">;
    orgRole: string | null | undefined;
  }
): Promise<ResolvedLegacyRoles> {
  const role = normalizeOrgRole(args.orgRole);

  // Owners are implicitly assigned to every project.
  let assigned = role === "owner";
  // A scoped developer's environment restriction (subset semantics). Only
  // populated for an assigned developer whose projectMembers row sets it.
  let environmentScope: string[] | null = null;
  if (!assigned) {
    const projectMembership = await convex.query(
      api.projectMembers.getProjectMembership,
      { projectId: args.projectId, userId: args.userId }
    );
    assigned = projectMembership !== null;
    if (role === "developer") {
      environmentScope = projectMembership?.environments ?? null;
    }
  }

  let grantOnly = false;
  let legacyProjectRole = toLegacyProjectRole(args.orgRole, assigned);

  if (!assigned) {
    const grants = await convex.query(api.permissions.getForUser, {
      userId: args.userId,
    });
    const now = Date.now();
    grantOnly = grants.some(
      (grant) =>
        grant !== null &&
        grant.project?._id === args.projectId &&
        (grant.expiresAt === undefined || grant.expiresAt > now)
    );
    if (grantOnly) {
      legacyProjectRole = "viewer";
    }
  }

  return {
    role,
    legacyRole: toLegacyOrgRole(args.orgRole),
    assigned,
    grantOnly,
    legacyProjectRole,
    environmentScope,
  };
}

/**
 * True when a Convex mutation rejected the caller for authorization reasons
 * (e.g. a developer updating a variable they have no write grant on). Routes
 * translate these into the standard FORBIDDEN response instead of a 500.
 */
export function isAuthorizationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not authorized|insufficient permission|permission denied|forbidden|no write (access|permission)/i.test(
    message
  );
}
