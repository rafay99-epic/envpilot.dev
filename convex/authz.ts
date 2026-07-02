import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ─── Unified role model ───────────────────────────────────────────────────────
//
// ONE role per user, stored on organizationMembers.role. What a user can do in
// a project is a function of (their org role, whether they are assigned to the
// project via projectMembers). projectMembers no longer carries its own role —
// it is a pure scope assignment.
//
//   owner            — full control over the organization and every project
//   project_manager  — full control over the projects they are assigned to
//                      (can be assigned to many); manages team leads/developers
//   team_lead        — manages variables and developer access in their
//                      assigned project(s)
//   developer        — works in assigned projects; sees variable values only
//                      via explicit per-variable grants (write auto-granted on
//                      variables they create)
//
// Per-variable VIEW sharing is a grant (variablePermissions), not a role: any
// org member can be granted read on a specific variable.

export type OrgRole = "owner" | "project_manager" | "team_lead" | "developer";
/** Roles that may still exist in the DB from before the unified-role migration. */
export type LegacyOrgRole = "admin" | "member";
export type StoredOrgRole = OrgRole | LegacyOrgRole;
export type VariablePermission = "read" | "write" | "admin"; // "admin" is legacy, treated as "write"

/** Map legacy role values (pre-migration rows) onto the unified model. */
export function normalizeOrgRole(role: string): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case "owner":
    case "project_manager":
    case "team_lead":
    case "developer":
      return role;
    default:
      return "developer";
  }
}

// ─── Role hierarchy (higher number = more authority) ──────────────────────────

export const ROLE_LEVEL: Record<OrgRole, number> = {
  owner: 4,
  project_manager: 3,
  team_lead: 2,
  developer: 1,
};

export function roleLevel(role: string): number {
  return ROLE_LEVEL[normalizeOrgRole(role)];
}

// ─── Action → allowed org roles mapping ───────────────────────────────────────
//
// This is the SINGLE SOURCE OF TRUTH for what each role can do.
// Frontend reads these via the getMyPermissions query. Backend enforces
// them via the assert* helpers below. Nothing else defines permissions.

export const ORG_ACTIONS = {
  // Organization management
  "org:update": ["owner"] as OrgRole[],
  "org:delete": ["owner"] as OrgRole[],
  "org:transfer_ownership": ["owner"] as OrgRole[],
  "org:update_settings": ["owner"] as OrgRole[],
  "org:manage_billing": ["owner"] as OrgRole[],

  // Member management (hierarchy also applies: see assertCanManageUser /
  // assertCanAssignRole — you can only invite/manage roles below your own)
  "org:invite_member": ["owner", "project_manager", "team_lead"] as OrgRole[],
  "org:remove_member": ["owner", "project_manager"] as OrgRole[],
  "org:change_role": ["owner"] as OrgRole[],

  // Session management
  "org:revoke_session": ["owner", "project_manager"] as OrgRole[],
  "org:view_sessions": ["owner", "project_manager"] as OrgRole[],

  // Project lifecycle
  "org:create_project": ["owner", "project_manager"] as OrgRole[],
  "org:delete_project": ["owner"] as OrgRole[],

  // Extension/CLI linking (any org member can link their own)
  "org:link_extension": [
    "owner",
    "project_manager",
    "team_lead",
    "developer",
  ] as OrgRole[],

  // Variable rollback (owner-only power feature)
  "org:rollback_variable": ["owner"] as OrgRole[],

  // Tag management
  "org:create_tag": [
    "owner",
    "project_manager",
    "team_lead",
    "developer",
  ] as OrgRole[],
  "org:manage_tag": ["owner", "project_manager", "team_lead"] as OrgRole[],
} as const;

// Project actions are checked against the user's ORG role, gated on their
// assignment to the project (projectMembers row). Owners bypass assignment.
export const PROJECT_ACTIONS = {
  "project:read": ["project_manager", "team_lead", "developer"] as OrgRole[],
  "project:update": ["project_manager"] as OrgRole[],
  "project:create_variable": [
    "project_manager",
    "team_lead",
    "developer",
  ] as OrgRole[],
  // Developers update variables via per-variable write grants, enforced in
  // getVariableAccess — not via this action.
  "project:update_variable": ["project_manager", "team_lead"] as OrgRole[],
  "project:delete_variable": ["project_manager", "team_lead"] as OrgRole[],
  "project:manage_permissions": ["project_manager", "team_lead"] as OrgRole[],
  // Team leads may only add/remove developers (hierarchy enforced separately).
  "project:manage_members": ["project_manager", "team_lead"] as OrgRole[],
} as const;

export type OrgAction = keyof typeof ORG_ACTIONS;
export type ProjectAction = keyof typeof PROJECT_ACTIONS;

// ─── Legacy client compatibility ──────────────────────────────────────────────
//
// Deployed CLI / VS Code extension builds hardcode the old role strings and
// derive OS-level .env file protection from them. Until those clients ship
// with the unified model, API routes translate through these mappings.

export function toLegacyOrgRole(
  role: OrgRole
): "admin" | "team_lead" | "member" {
  switch (role) {
    case "owner":
      return "admin";
    case "project_manager":
    case "team_lead":
      return "team_lead";
    case "developer":
      return "member";
  }
}

/**
 * Legacy per-project role for old clients: writable roles map to "manager",
 * developers map to "developer" (readonly-with-request), and grant-only
 * viewers map to "viewer" (strict readonly).
 */
export function toLegacyProjectRole(
  role: OrgRole,
  assigned: boolean
): "manager" | "developer" | "viewer" | null {
  if (!assigned) return null;
  switch (role) {
    case "owner":
    case "project_manager":
    case "team_lead":
      return "manager";
    case "developer":
      return "developer";
  }
}

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
  /** Whether the user has an explicit projectMembers assignment. Owners may not. */
  assigned: boolean;
  /**
   * Environment scope of the assignment (developers only). Undefined =
   * unrestricted. Callers creating/updating variables must check this via
   * isEnvironmentScopeAllowed.
   */
  environmentScope?: string[];
}

// ─── Environment scoping ──────────────────────────────────────────────────────

/**
 * Whether an environment scope permits a variable.
 *
 * Subset semantics: EVERY environment the variable belongs to must be inside
 * the allowed scope. A variable tagged ["development", "production"] is NOT
 * accessible to a scope of ["development", "staging"] — its value is live in
 * production, so a production-excluded developer must never see it.
 *
 * An undefined scope means unrestricted.
 */
export function isEnvironmentScopeAllowed(
  scope: string[] | undefined,
  variableEnvironments: string[]
): boolean {
  if (!scope) return true;
  return variableEnvironments.every((env) => scope.includes(env));
}

// ─── Core assertion helpers ───────────────────────────────────────────────────

/**
 * Assert that a user has a specific org-level action.
 *
 * Usage: `await assertOrgAction(ctx, userId, orgId, "org:remove_member");`
 *
 * Returns the caller's membership record (with normalized role) on success.
 * Throws on failure.
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

  const role = normalizeOrgRole(membership.role);
  const allowedRoles = ORG_ACTIONS[action];
  if (!allowedRoles.includes(role)) {
    throw new Error(
      `Insufficient permissions: ${action} requires ${allowedRoles.join(" or ")}`
    );
  }

  return {
    membership: {
      _id: membership._id,
      role,
      userId: membership.userId,
      organizationId: membership.organizationId,
    },
  };
}

/**
 * Assert that a user can perform an action on a project.
 *
 * Owners bypass the assignment check entirely. Everyone else needs an
 * explicit projectMembers assignment AND an org role permitted for the action.
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

  const role = normalizeOrgRole(membership.role);

  // Owners bypass project assignment checks
  if (role === "owner") {
    return { orgRole: "owner", assigned: false };
  }

  // Everyone else needs an explicit project assignment
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
  if (!allowedRoles.includes(role)) {
    throw new Error(
      `Insufficient project permissions: ${action} requires ${allowedRoles.join(" or ")}`
    );
  }

  return {
    orgRole: role,
    assigned: true,
    // Environment scope only constrains developers; managers are unrestricted
    environmentScope:
      role === "developer" ? projectMembership.environments : undefined,
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

  const role = normalizeOrgRole(membership.role);

  if (minimumRole) {
    if (roleLevel(role) < ROLE_LEVEL[minimumRole]) {
      throw new Error(
        `Insufficient permissions: requires at least ${minimumRole} role`
      );
    }
  }

  return {
    membership: {
      _id: membership._id,
      role,
      userId: membership.userId,
      organizationId: membership.organizationId,
    },
  };
}

/**
 * Assert that an actor can manage a target user (hierarchy enforcement).
 *
 * Rule: a user can only manage users strictly BELOW their level.
 * - owner manages project_manager, team_lead, developer
 * - project_manager manages team_lead, developer
 * - team_lead manages developer
 * - developer manages no one
 */
export function assertCanManageUser(
  actorRole: string,
  targetRole: string,
  action: string
): void {
  const actor = normalizeOrgRole(actorRole);
  const target = normalizeOrgRole(targetRole);

  if (roleLevel(target) >= roleLevel(actor)) {
    throw new Error(`Cannot ${action}: a ${actor} cannot manage a ${target}`);
  }
}

/**
 * Assert that an actor can assign/invite someone into a role.
 *
 * Owners can assign any role (including another owner). Everyone else can
 * only assign roles strictly below their own.
 */
export function assertCanAssignRole(
  actorRole: string,
  targetRole: string
): void {
  const actor = normalizeOrgRole(actorRole);
  const target = normalizeOrgRole(targetRole);

  if (actor === "owner") return;
  if (roleLevel(target) >= roleLevel(actor)) {
    throw new Error(
      `Cannot assign role: a ${actor} can only assign roles below their own`
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

// ─── Variable-level access ────────────────────────────────────────────────────

/**
 * Look up a user's active, unexpired grant on a variable (if any).
 * Multiple rows can exist per (variable, user) — revoked history stays around —
 * so scan the index result for the active one.
 */
export async function getActiveVariableGrant(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  variableId: Id<"environmentVariables">
): Promise<Doc<"variablePermissions"> | null> {
  const grants = await ctx.db
    .query("variablePermissions")
    .withIndex("by_variable_and_user", (q) =>
      q.eq("variableId", variableId).eq("userId", userId)
    )
    .collect();

  return (
    grants.find(
      (g) => g.isActive && (!g.expiresAt || g.expiresAt > Date.now())
    ) ?? null
  );
}

/**
 * Compute a user's effective access to a single variable.
 *
 *   "write" — can view and modify the value
 *   "read"  — can view the value only
 *   null    — no access
 *
 * Rules:
 * - owner: write on everything
 * - project_manager / team_lead assigned to the variable's project: write
 * - developer assigned to the project: per-variable grant decides
 *   (write grant → write, read grant → read, none → null)
 * - anyone else in the org with an active grant: read only
 *   (this is the per-variable "viewer" sharing path — grants work even
 *   without a project assignment, capped at read for unassigned users)
 */
export async function getVariableAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  variable: Doc<"environmentVariables">
): Promise<"write" | "read" | null> {
  const project = await ctx.db.get(variable.projectId);
  if (!project || project.deletedAt) return null;

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) return null;

  const role = normalizeOrgRole(membership.role);
  if (role === "owner") return "write";

  const projectMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", variable.projectId).eq("userId", userId)
    )
    .first();

  if (
    projectMembership &&
    (role === "project_manager" || role === "team_lead")
  ) {
    return "write";
  }

  // Environment scope: an assigned developer restricted to e.g.
  // ["development", "staging"] never gets access to a variable that lives in
  // production — grants included.
  if (
    projectMembership &&
    role === "developer" &&
    !isEnvironmentScopeAllowed(
      projectMembership.environments,
      variable.environments
    )
  ) {
    return null;
  }

  // Developers (and any grant-only viewers) fall through to explicit grants
  const grant = await getActiveVariableGrant(ctx, userId, variable._id);
  if (!grant) return null;

  // Users without a project assignment are capped at read (viewer sharing)
  if (!projectMembership) return "read";

  return grant.permission === "read" ? "read" : "write"; // legacy "admin" → write
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
  returns: v.object({
    orgRole: v.union(
      v.literal("owner"),
      v.literal("project_manager"),
      v.literal("team_lead"),
      v.literal("developer"),
      v.null()
    ),
    assigned: v.boolean(),
    actions: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    // 1. Resolve org membership
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return {
        orgRole: null,
        assigned: false,
        actions: [] as string[],
      };
    }

    const orgRole = normalizeOrgRole(membership.role);

    // 2. Compute org-level actions for this role
    const orgActions = Object.entries(ORG_ACTIONS)
      .filter(([, roles]) => (roles as readonly string[]).includes(orgRole))
      .map(([action]) => action);

    // 3. Compute project-level actions (if projectId provided)
    let assigned = false;
    let projectActions: string[] = [];

    if (args.projectId) {
      // Verify project exists and is not soft-deleted
      const project = await ctx.db.get(args.projectId);
      if (!project || (project as Record<string, unknown>).deletedAt) {
        return { orgRole, assigned: false, actions: orgActions };
      }

      if (orgRole === "owner") {
        // Owners get all project actions implicitly
        projectActions = Object.keys(PROJECT_ACTIONS);
      } else {
        const pm = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", args.projectId!).eq("userId", args.userId)
          )
          .first();

        if (pm) {
          assigned = true;
          projectActions = Object.entries(PROJECT_ACTIONS)
            .filter(([, roles]) =>
              (roles as readonly string[]).includes(orgRole)
            )
            .map(([action]) => action);
        }
      }
    }

    return {
      orgRole,
      assigned,
      actions: [...orgActions, ...projectActions],
    };
  },
});
