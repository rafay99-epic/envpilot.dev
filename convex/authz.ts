import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─── Role types ───────────────────────────────────────────────────────────────

export type OrgRole = "admin" | "team_lead" | "member";
export type ProjectRole = "manager" | "developer" | "viewer";
export type VariablePermission = "read" | "write" | "admin";

// ─── Role hierarchy (higher number = more authority) ──────────────────────────

export const ROLE_LEVEL: Record<string, number> = {
  admin: 3,
  team_lead: 2,
  member: 1,
};

// ─── Action → allowed org roles mapping ───────────────────────────────────────
//
// This is the SINGLE SOURCE OF TRUTH for what each org role can do.
// Frontend reads these via the getMyPermissions query. Backend enforces
// them via the assert* helpers below. Nothing else defines permissions.

export const ORG_ACTIONS = {
  // Organization management
  "org:update": ["admin"] as OrgRole[],
  "org:delete": ["admin"] as OrgRole[],
  "org:transfer_ownership": ["admin"] as OrgRole[],
  "org:update_settings": ["admin"] as OrgRole[],

  // Member management
  "org:invite_member": ["admin", "team_lead"] as OrgRole[],
  "org:remove_member": ["admin"] as OrgRole[],
  "org:change_role": ["admin"] as OrgRole[],

  // Session management
  "org:revoke_session": ["admin", "team_lead"] as OrgRole[],
  "org:view_sessions": ["admin", "team_lead"] as OrgRole[],

  // Project lifecycle
  "org:create_project": ["admin", "team_lead"] as OrgRole[],
  "org:delete_project": ["admin"] as OrgRole[],

  // Extension/CLI linking (any org member can link their own)
  "org:link_extension": ["admin", "team_lead", "member"] as OrgRole[],

  // Variable rollback (admin-only power feature)
  "org:rollback_variable": ["admin"] as OrgRole[],

  // Tag management
  "org:create_tag": ["admin", "team_lead", "member"] as OrgRole[],
  "org:manage_tag": ["admin", "team_lead"] as OrgRole[],

  // Anomaly detection (security feature — admin + team_lead only)
  "org:view_anomalies": ["admin", "team_lead"] as OrgRole[],
} as const;

export const PROJECT_ACTIONS = {
  "project:read": ["manager", "developer", "viewer"] as ProjectRole[],
  "project:update": ["manager"] as ProjectRole[],
  "project:create_variable": ["manager", "developer"] as ProjectRole[],
  "project:update_variable": ["manager", "developer"] as ProjectRole[],
  "project:delete_variable": ["manager"] as ProjectRole[],
  "project:manage_permissions": ["manager"] as ProjectRole[],
  "project:manage_members": ["manager"] as ProjectRole[],
} as const;

export type OrgAction = keyof typeof ORG_ACTIONS;
export type ProjectAction = keyof typeof PROJECT_ACTIONS;

// ─── Return types ─────────────────────────────────────────────────────────────

interface OrgAuthResult {
  membership: {
    _id: Id<"organizationMembers">;
    role: OrgRole;
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  };
}

interface ProjectAuthResult {
  orgRole: OrgRole;
  projectRole: ProjectRole | null;
}

// ─── Core assertion helpers ───────────────────────────────────────────────────

/**
 * Assert that a user has a specific org-level action.
 *
 * Usage: `await assertOrgAction(ctx, userId, orgId, "org:remove_member");`
 *
 * Returns the caller's membership record on success (useful for follow-up
 * checks like hierarchy enforcement). Throws on failure.
 */
export async function assertOrgAction(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  action: OrgAction
): Promise<OrgAuthResult> {
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  const allowedRoles = ORG_ACTIONS[action];
  if (!allowedRoles.includes(membership.role as OrgRole)) {
    throw new Error(
      `Insufficient permissions: ${action} requires ${allowedRoles.join(" or ")}`
    );
  }

  return {
    membership: {
      _id: membership._id,
      role: membership.role as OrgRole,
      userId: membership.userId,
      organizationId: membership.organizationId,
    },
  };
}

/**
 * Assert that a user can perform an action on a project.
 *
 * Org admins bypass the project-level check entirely.
 * Everyone else needs an explicit projectMembers entry with a permitted role.
 */
export async function assertProjectAction(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
  action: ProjectAction
): Promise<ProjectAuthResult> {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  // Org admins bypass project-level checks
  if (membership.role === "admin") {
    return { orgRole: "admin", projectRole: null };
  }

  // Everyone else needs explicit project membership
  const projectMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", userId)
    )
    .first();

  if (!projectMembership) {
    throw new Error("No access to this project");
  }

  const allowedRoles = PROJECT_ACTIONS[action];
  if (!allowedRoles.includes(projectMembership.role as ProjectRole)) {
    throw new Error(
      `Insufficient project permissions: ${action} requires ${allowedRoles.join(" or ")}`
    );
  }

  return {
    orgRole: membership.role as OrgRole,
    projectRole: projectMembership.role as ProjectRole,
  };
}

/**
 * Assert that a user has a minimum org role (without checking a specific action).
 *
 * Useful when the caller just needs "is this user at least a team_lead?" rather
 * than mapping to a named action (e.g. feature-flag checks, tier checks).
 */
export async function assertOrgMembership(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  minimumRole?: OrgRole
): Promise<OrgAuthResult> {
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  if (minimumRole) {
    const requiredLevel = ROLE_LEVEL[minimumRole] ?? 0;
    const actualLevel = ROLE_LEVEL[membership.role] ?? 0;
    if (actualLevel < requiredLevel) {
      throw new Error(
        `Insufficient permissions: requires at least ${minimumRole} role`
      );
    }
  }

  return {
    membership: {
      _id: membership._id,
      role: membership.role as OrgRole,
      userId: membership.userId,
      organizationId: membership.organizationId,
    },
  };
}

/**
 * Assert that an actor can manage a target user (hierarchy enforcement).
 *
 * Rule: a user can only manage users BELOW their level.
 * - Admin can manage team_lead and member
 * - Team_lead can manage member only
 * - Member cannot manage anyone
 */
export function assertCanManageUser(
  actorRole: string,
  targetRole: string,
  action: string
): void {
  const actorLevel = ROLE_LEVEL[actorRole] ?? 0;
  const targetLevel = ROLE_LEVEL[targetRole] ?? 0;

  if (targetLevel >= actorLevel) {
    throw new Error(
      `Cannot ${action}: a ${actorRole} cannot manage a ${targetRole}`
    );
  }
}

/**
 * Resolve the organization that owns a project.
 *
 * Small utility so callers don't have to duplicate the "get project → get orgId"
 * dance before calling assertOrgAction.
 */
export async function resolveProjectOrg(
  ctx: MutationCtx | QueryCtx,
  projectId: Id<"projects">
): Promise<{
  project: NonNullable<Awaited<ReturnType<typeof ctx.db.get>>>;
  organizationId: Id<"organizations">;
}> {
  const project = await ctx.db.get(projectId);
  if (!project || (project as Record<string, unknown>).deletedAt) {
    throw new Error("Project not found");
  }
  return {
    project,
    organizationId: (project as Record<string, unknown>)
      .organizationId as Id<"organizations">,
  };
}

// ─── Query: getMyPermissions ──────────────────────────────────────────────────
//
// The single endpoint that frontends (web, CLI, extension) call to learn what
// the current user is allowed to do. Returns a flat list of action strings
// (e.g. "org:invite_member", "project:update") that the UI can check with
// `actions.includes("org:invite_member")`.

export const getMyPermissions = query({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // 1. Resolve org membership
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return { orgRole: null, projectRole: null, actions: [] as string[] };
    }

    const orgRole = membership.role as OrgRole;

    // 2. Compute org-level actions for this role
    const orgActions = Object.entries(ORG_ACTIONS)
      .filter(([, roles]) => (roles as readonly string[]).includes(orgRole))
      .map(([action]) => action);

    // 3. Compute project-level actions (if projectId provided)
    let projectRole: string | null = null;
    let projectActions: string[] = [];

    if (args.projectId) {
      // Verify project exists and is not soft-deleted
      const project = await ctx.db.get(args.projectId);
      if (!project || (project as Record<string, unknown>).deletedAt) {
        return { orgRole, projectRole: null, actions: orgActions };
      }

      if (orgRole === "admin") {
        // Admins get all project actions implicitly
        projectActions = Object.keys(PROJECT_ACTIONS);
      } else {
        const pm = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", args.projectId!).eq("userId", args.userId)
          )
          .first();

        if (pm) {
          projectRole = pm.role;
          projectActions = Object.entries(PROJECT_ACTIONS)
            .filter(([, roles]) =>
              (roles as readonly string[]).includes(pm.role)
            )
            .map(([action]) => action);
        }
      }
    }

    return {
      orgRole,
      projectRole,
      actions: [...orgActions, ...projectActions],
    };
  },
});
