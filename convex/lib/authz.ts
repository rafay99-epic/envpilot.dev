import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type CapabilityKey,
  ORG_ACTION_TO_CAPABILITY,
  PROJECT_ACTION_TO_CAPABILITY,
} from "./capabilities";
import {
  type RoleProfile,
  SYSTEM_PROFILES,
  SEEDED_CUSTOM_PROFILES,
  UNKNOWN_ROLE_PROFILE,
  effectiveEnvironments,
  hasCapability,
  resolveCapabilities,
} from "./roleProfiles";
export { effectiveEnvironments } from "./roleProfiles";
import type { OrgAction, ProjectAction } from "./capabilities";

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

/**
 * Role slugs are OPEN — the four system slugs below are seeded, and custom
 * roles are registry rows created from the admin panel. Feature code must
 * never compare slugs; ask the resolved profile (getRoleProfile) instead.
 */
export type OrgRole = string;
export const SYSTEM_ROLE_SLUGS = [
  "owner",
  "project_manager",
  "team_lead",
  "developer",
] as const;
/** Roles that may still exist in the DB from before the unified-role migration. */
export type LegacyOrgRole = "admin" | "member";
export type StoredOrgRole = OrgRole | LegacyOrgRole;
export type VariablePermission = "read" | "write" | "admin"; // "admin" is legacy, treated as "write"

/**
 * Map legacy role values (pre-migration rows) onto slugs. Unknown slugs pass
 * THROUGH — the registry resolver decides what they mean (fail-closed when
 * absent). Only truly empty values fall back to "developer".
 */
export function normalizeOrgRole(role: string): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case "":
    case undefined as unknown as string:
      return "developer";
    default:
      return role;
  }
}

// ─── Role hierarchy (higher number = more authority) ──────────────────────────
//
// Registry levels are authoritative (owner 100 … viewer 20). The sync
// ROLE_LEVEL/roleLevel pair below covers the SEEDED slugs only and exists for
// call sites that compare against a known system floor (e.g. "team_lead and
// above") without a ctx at hand; unknown slugs resolve to 0 (fail closed) —
// custom roles must be compared via their resolved profile.level.

export const ROLE_LEVEL: Record<string, number> = {
  owner: 100,
  project_manager: 80,
  team_lead: 60,
  developer: 40,
  // editor/viewer deliberately ABSENT: their levels are registry rows the
  // admin panel can edit — static copies here would drift. Only SYSTEM
  // floors may be compared synchronously; everything else goes through the
  // resolved profile.level.
};

export function roleLevel(role: string): number {
  return ROLE_LEVEL[normalizeOrgRole(role)] ?? 0;
}

// ─── Registry-driven capability resolution ────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH: the capability catalog (lib/capabilities.ts) plus
// the roleRegistry table (seeded from lib/roleProfiles.ts SYSTEM_PROFILES /
// SEEDED_CUSTOM_PROFILES). Existing assert* call sites keep their action
// strings — ORG_ACTION_TO_CAPABILITY / PROJECT_ACTION_TO_CAPABILITY translate.
//
// DUAL-MODE MIGRATION: until seed-role-registry has run, the registry table
// is empty and the resolver falls back to the built-in profiles — byte-
// identical to the pre-registry behavior (asserted by the golden parity
// suite). Unknown slugs fail CLOSED (zero capabilities).
//
// COST RULE: resolve the profile ONCE per request and pass it down. The
// registry is a tiny by_slug read, but per-row/per-loop resolution is a
// review-blocking finding.

export type { OrgAction, ProjectAction } from "./capabilities";
export type { RoleProfile } from "./roleProfiles";
export { hasCapability } from "./roleProfiles";

/**
 * Resolve a role slug to its capability profile.
 * Order: registry row (active) → built-in seeded profile → fail-closed.
 */
export async function getRoleProfile(
  ctx: MutationCtx | QueryCtx,
  role: string
): Promise<RoleProfile> {
  const slug = normalizeOrgRole(role);
  const row = await ctx.db
    .query("roleRegistry")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (row && row.isActive) {
    return {
      slug: row.slug,
      displayName: row.displayName,
      description: row.description,
      color: row.color,
      level: row.level,
      isSystem: row.isSystem,
      capabilities: resolveCapabilities(
        row.slug,
        row.capabilities as RoleProfile["capabilities"]
      ),
      environments: row.environments,
    };
  }
  if (row && !row.isActive) {
    // Deactivated roles fail closed even if a member still holds the slug
    // (the admin panel blocks that, but data wins over assumptions here).
    return UNKNOWN_ROLE_PROFILE;
  }
  const builtin = SYSTEM_PROFILES[slug] ?? SEEDED_CUSTOM_PROFILES[slug];
  return builtin ?? UNKNOWN_ROLE_PROFILE;
}

/** Capability check against a resolved profile. */
export function profileCan(
  profile: RoleProfile,
  capability: CapabilityKey
): boolean {
  return hasCapability(profile, capability);
}

/**
 * Assignment bypass: a profile holding org.manage (the owner class) has
 * implicit access to every project in the org — the registry generalization
 * of the old `role === "owner"` special case.
 */
/**
 * Hierarchy filter: keep members whose resolved role level is strictly below
 * the requester's. Owner-class requesters (org.manage) are exempt and see
 * everyone. Profiles resolve once per distinct slug, not per member.
 */
export async function filterMembersStrictlyBelow<T extends { role: string }>(
  ctx: MutationCtx | QueryCtx,
  requesterRole: string,
  members: T[]
): Promise<T[]> {
  const requesterProfile = await getRoleProfile(ctx, requesterRole);
  if (bypassesAssignment(requesterProfile)) return members;
  const levelMemo = new Map<string, number>();
  const out: T[] = [];
  for (const member of members) {
    const slug = normalizeOrgRole(member.role);
    if (!levelMemo.has(slug)) {
      levelMemo.set(slug, (await getRoleProfile(ctx, slug)).level);
    }
    if ((levelMemo.get(slug) ?? 0) < requesterProfile.level) out.push(member);
  }
  return out;
}

export function bypassesAssignment(profile: RoleProfile): boolean {
  return hasCapability(profile, "org.manage");
}

// ─── Legacy client compatibility ──────────────────────────────────────────────
//
// Deployed CLI / VS Code extension builds hardcode the old role strings and
// derive OS-level .env file protection from them. Until those clients ship
// with the unified model, API routes translate through these mappings.

export function toLegacyOrgRole(
  role: OrgRole
): "admin" | "team_lead" | "member" {
  switch (normalizeOrgRole(role)) {
    case "owner":
      return "admin";
    case "project_manager":
    case "team_lead":
      return "team_lead";
    default:
      // Custom roles and developer-class roles map to "member" for old
      // clients — labels are cosmetic there; writability rides the meta
      // booleans, never the role string.
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
  switch (normalizeOrgRole(role)) {
    case "owner":
    case "project_manager":
    case "team_lead":
      return "manager";
    default:
      // Custom roles map to "developer" (readonly-with-request on old
      // clients; actual writability comes from meta.hasWriteAccess). The
      // profile-aware variant below refines auditor-class roles to "viewer".
      return "developer";
  }
}

/**
 * Profile-aware legacy project role for old clients: blanket-write roles →
 * "manager" (writable .env), blanket-read auditor roles → "viewer" (strict
 * readonly), everything else → "developer" (readonly-with-request).
 */
export function profileToLegacyProjectRole(
  profile: RoleProfile,
  assigned: boolean
): "manager" | "developer" | "viewer" | null {
  // Wire parity with main: unassigned users (owner class included) get null.
  if (!assigned) return null;
  if (
    bypassesAssignment(profile) ||
    hasCapability(profile, "project.variables.update")
  ) {
    return "manager";
  }
  if (hasCapability(profile, "access.blanket_read")) {
    return "viewer";
  }
  return "developer";
}

// ─── Return types ─────────────────────────────────────────────────────────────

interface OrgAuthResult {
  membership: {
    _id: Id<"organizationMembers">;
    role: OrgRole;
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  };
  /** Resolved capability profile — pass it down; never re-resolve per row. */
  profile: RoleProfile;
}

interface ProjectAuthResult {
  orgRole: OrgRole;
  /** Whether the user has an explicit projectMembers assignment. Owners may not. */
  assigned: boolean;
  /** Resolved capability profile — pass it down; never re-resolve per row. */
  profile: RoleProfile;
  /**
   * Environment scope of the assignment (env-scopeable roles only).
   * Undefined = unrestricted. Callers creating/updating variables must check
   * this via isEnvironmentScopeAllowed.
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

/** User-facing denial for a single out-of-scope environment write. */
export function environmentAccessMessage(env: string): string {
  return `You do not have access to the ${env} environment in this project. Ask a project manager or team lead.`;
}

/**
 * Assert that a member scope being written (assignment, invitation) does not
 * widen past the target role's default. Undefined role default = unrestricted,
 * so any list narrows it. Omitted/undefined environments (no scope supplied)
 * always passes — callers reject an empty array separately.
 */
export function assertEnvironmentScopeNarrows(
  profile: Pick<RoleProfile, "environments">,
  environments: string[] | undefined
): void {
  if (!environments) return;
  const ceiling = profile.environments;
  if (!ceiling) return;
  const outOfBounds = environments.some((env) => !ceiling.includes(env));
  if (outOfBounds) {
    throw new ConvexError(
      `This role is limited to ${ceiling.join(", ")}. A member scope can only narrow it.`
    );
  }
}

// ─── Security hold (suspension) ───────────────────────────────────────────────
//
// A suspended membership keeps its role/assignments/grants but is denied at
// EVERY authz decision below — web, CLI, extension, REST API, and MCP all
// route through these helpers, so this is the single enforcement point.
// Clients match on the ACCESS_SUSPENDED token to render the org-contact
// message instead of a generic permission error.

export const ACCESS_SUSPENDED_TOKEN = "ACCESS_SUSPENDED";

export function isSuspendedMembership(
  membership: Pick<Doc<"organizationMembers">, "status">
): boolean {
  return membership.status === "suspended";
}

export function assertNotSuspended(
  membership: Pick<Doc<"organizationMembers">, "status">
): void {
  if (isSuspendedMembership(membership)) {
    // ConvexError, NOT a plain Error: production deployments redact plain
    // application error messages to "Server Error", which would strip the
    // token and leave the CLI/extension showing a useless generic failure.
    // ConvexError data crosses to clients verbatim in prod.
    throw new ConvexError(
      `${ACCESS_SUSPENDED_TOKEN}: Your access to this organization has been revoked. Please contact your organization.`
    );
  }
}

/**
 * Resolve a user's org membership, treating a SUSPENDED membership as no
 * membership at all. Use this in the many read paths that gate on "is the
 * caller a member of this org" by reading `organizationMembers` inline
 * (variable/account/share list queries, project-access validation, vault
 * value reads) — a suspended member must be indistinguishable from a
 * non-member there, so their secrets/vaultRefs never surface. Returns null
 * for both "not a member" and "suspended", so callers keep their existing
 * `if (!membership) return <empty>` behavior unchanged.
 */
export async function getActiveMembership(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">
): Promise<Doc<"organizationMembers"> | null> {
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();
  if (!membership || isSuspendedMembership(membership)) return null;
  return membership;
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
  assertNotSuspended(membership);

  const role = normalizeOrgRole(membership.role);
  const profile = await getRoleProfile(ctx, role);
  const capability = ORG_ACTION_TO_CAPABILITY[action];
  if (!hasCapability(profile, capability)) {
    // ConvexError: user-facing denial — plain Error is redacted in prod.
    throw new ConvexError(
      `Insufficient permissions: ${action} requires the "${capability}" capability (your role: ${profile.displayName})`
    );
  }

  return {
    membership: {
      _id: membership._id,
      role,
      userId: membership.userId,
      organizationId: membership.organizationId,
    },
    profile,
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
  action: ProjectAction,
  // Caller-supplied project doc when it was already fetched, so this doesn't
  // re-read the same row a second time in the same request. Falls back to
  // fetching when omitted — behavior is identical either way.
  preloadedProject?: Doc<"projects"> | null
): Promise<ProjectAuthResult> {
  return assertProjectCapability(
    ctx,
    userId,
    projectId,
    PROJECT_ACTION_TO_CAPABILITY[action],
    preloadedProject,
    action
  );
}

/**
 * Same as assertProjectAction, keyed by capability instead of a legacy
 * action string. Capabilities that never had a pre-registry action
 * (protection.*) are checked through here so the parity fixtures stay
 * frozen.
 */
export async function assertProjectCapability(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
  capability: CapabilityKey,
  preloadedProject?: Doc<"projects"> | null,
  actionLabel: string = capability
): Promise<ProjectAuthResult> {
  const action = actionLabel;
  const project =
    preloadedProject !== undefined
      ? preloadedProject
      : await ctx.db.get(projectId);
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
  assertNotSuspended(membership);

  const role = normalizeOrgRole(membership.role);
  const profile = await getRoleProfile(ctx, role);

  // The owner class (org.manage) bypasses project assignment checks
  if (bypassesAssignment(profile)) {
    if (!hasCapability(profile, capability)) {
      throw new ConvexError(
        `Insufficient project permissions: ${action} requires the "${capability}" capability (your role: ${profile.displayName})`
      );
    }
    return { orgRole: role, assigned: false, profile };
  }

  // Everyone else needs an explicit project assignment
  const projectMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", userId)
    )
    .first();

  if (!projectMembership) {
    throw new ConvexError("No access to this project");
  }

  if (!hasCapability(profile, capability)) {
    throw new ConvexError(
      `Insufficient project permissions: ${action} requires the "${capability}" capability (your role: ${profile.displayName})`
    );
  }

  return {
    orgRole: role,
    assigned: true,
    profile,
    // Environment scope constrains env-scopeable roles; managers are
    // unrestricted (profile-driven — no slug comparisons). Role default
    // narrowed by the assignment list.
    environmentScope: effectiveEnvironments(
      profile,
      projectMembership.environments
    ),
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
  assertNotSuspended(membership);

  const role = normalizeOrgRole(membership.role);
  const profile = await getRoleProfile(ctx, role);

  if (minimumRole) {
    // Minimum floors are expressed as SEEDED slugs (owner/PM/TL/…); the
    // caller's own level comes from their resolved profile so custom roles
    // slot into the hierarchy correctly.
    const floor = ROLE_LEVEL[minimumRole] ?? Number.POSITIVE_INFINITY;
    if (profile.level < floor) {
      throw new ConvexError(
        `Insufficient permissions: requires at least the ${minimumRole} role`
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
    profile,
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

/**
 * Registry-aware hierarchy check — resolves BOTH roles' levels through the
 * registry so custom roles participate correctly. Prefer this over the sync
 * variant wherever a ctx is available (the sync variant scores unknown
 * custom slugs as level 0 — fail closed, but wrong for elevated custom
 * roles acting as managers).
 */
export async function assertCanManageUserAsync(
  ctx: MutationCtx | QueryCtx,
  actorRole: string,
  targetRole: string,
  action: string
): Promise<void> {
  const [actor, target] = await Promise.all([
    getRoleProfile(ctx, actorRole),
    getRoleProfile(ctx, targetRole),
  ]);
  if (target.level >= actor.level) {
    throw new ConvexError(
      `Cannot ${action}: a ${actor.displayName} cannot manage a ${target.displayName}`
    );
  }
}

/**
 * Assert that an actor can assign/invite someone into a role.
 *
 * Owners can assign any role (including another owner). Everyone else can
 * only assign roles strictly below their own.
 */

/** Registry-aware role-assignment hierarchy (see assertCanManageUserAsync). */
export async function assertCanAssignRoleAsync(
  ctx: MutationCtx | QueryCtx,
  actorRole: string,
  targetRole: string
): Promise<void> {
  const [actor, target] = await Promise.all([
    getRoleProfile(ctx, actorRole),
    getRoleProfile(ctx, targetRole),
  ]);
  // The owner class assigns anything, including another owner.
  if (bypassesAssignment(actor)) return;
  if (target.level >= actor.level) {
    throw new ConvexError(
      `Cannot assign role: a ${actor.displayName} can only assign roles below their own`
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
 * Shared profile-driven access resolution for a single resource
 * (variable or account). Mirrors the pre-registry behavior exactly:
 *
 *   org.manage (owner class)              → write, assignment bypassed
 *   assigned + <blanketWrite capability>  → write
 *   env-scopeable + out-of-scope          → null (grants included)
 *   assigned + access.blanket_read        → read (auditor class)
 *   grant present                         → unassigned capped at read;
 *     assigned grant-fallback roles get the grant's permission
 *     (read → read, write/legacy-admin → write)
 *   otherwise                             → null
 */
async function resolveResourceAccess(
  ctx: MutationCtx | QueryCtx,
  args: {
    userId: Id<"users">;
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    resourceEnvironments: string[];
    blanketWrite: CapabilityKey;
    getGrant: () => Promise<{ permission: string } | null>;
  }
): Promise<"write" | "read" | null> {
  const membership = await getActiveMembership(
    ctx,
    args.organizationId,
    args.userId
  );
  if (!membership) return null;

  const profile = await getRoleProfile(ctx, membership.role);
  if (bypassesAssignment(profile)) return "write";

  const projectMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", args.projectId).eq("userId", args.userId)
    )
    .first();

  // Environment scope FIRST: an assigned env-scopeable role never gets
  // access to an out-of-scope resource — blanket write and grants included.
  // (Ordering matters: a role holding BOTH access.env_scoped and a blanket
  // write capability — the seeded editor — must not write out-of-scope
  // resources it can't even see in lists.)
  if (
    projectMembership &&
    !isEnvironmentScopeAllowed(
      effectiveEnvironments(profile, projectMembership.environments),
      args.resourceEnvironments
    )
  ) {
    return null;
  }

  if (projectMembership && hasCapability(profile, args.blanketWrite)) {
    return "write";
  }

  // Blanket read (auditor class): every in-scope resource, no grants needed.
  if (projectMembership && hasCapability(profile, "access.blanket_read")) {
    return "read";
  }

  // Grant fallback (and unassigned per-resource sharing for ANY org member).
  const grant = await args.getGrant();
  if (!grant) return null;

  // Users without a project assignment are capped at read (viewer sharing).
  if (!projectMembership) return "read";

  // Assigned grant-fallback roles: the grant decides (legacy "admin" → write).
  if (hasCapability(profile, "access.grant_fallback")) {
    return grant.permission === "read" ? "read" : "write";
  }

  // Assigned role with neither blanket access nor grant fallback: the grant
  // still caps at read (defensive default — never widens access).
  return "read";
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
  variable: Doc<"environmentVariables">,
  // Caller-supplied project doc when it was already fetched, avoiding a
  // duplicate read of the same row. Falls back to fetching when omitted.
  preloadedProject?: Doc<"projects"> | null
): Promise<"write" | "read" | null> {
  const project =
    preloadedProject !== undefined
      ? preloadedProject
      : await ctx.db.get(variable.projectId);
  if (!project || project.deletedAt) return null;

  return resolveResourceAccess(ctx, {
    userId,
    projectId: variable.projectId,
    organizationId: project.organizationId,
    resourceEnvironments: variable.environments,
    blanketWrite: "project.variables.update",
    getGrant: () => getActiveVariableGrant(ctx, userId, variable._id),
  });
}

// ─── Account-level access ─────────────────────────────────────────────────────
//
// Shared accounts (projectAccounts) inherit the exact access model of
// environment variables: role-based blanket access for owners / assigned
// managers, per-account grants for developers, environment scoping for
// scoped developers, and capped-read viewer sharing for unassigned members.

/**
 * Look up a user's active, unexpired grant on an account (if any).
 * Mirrors getActiveVariableGrant — multiple rows can exist per (account,
 * user) as revoked history accumulates, so scan for the active one.
 */
export async function getActiveAccountGrant(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  accountId: Id<"projectAccounts">
): Promise<Doc<"accountPermissions"> | null> {
  const grants = await ctx.db
    .query("accountPermissions")
    .withIndex("by_account_and_user", (q) =>
      q.eq("accountId", accountId).eq("userId", userId)
    )
    .collect();

  return (
    grants.find(
      (g) => g.isActive && (!g.expiresAt || g.expiresAt > Date.now())
    ) ?? null
  );
}

/**
 * Compute a user's effective access to a single shared account.
 *
 *   "write" — can view and modify the credentials
 *   "read"  — can view the credentials only
 *   null    — no access
 *
 * EXACT mirror of getVariableAccess:
 * - owner: write on everything
 * - project_manager / team_lead assigned to the account's project: write
 * - developer assigned to the project: environment-scope check first
 *   (out-of-scope → null even with a grant), then the per-account grant
 *   decides (write grant → write, read grant → read, none → null)
 * - anyone else in the org with an active grant: read only
 *   (per-account "viewer" sharing — grants work without an assignment)
 */
export async function getAccountAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  account: Doc<"projectAccounts">,
  // Caller-supplied project doc when it was already fetched, avoiding a
  // duplicate read of the same row. Falls back to fetching when omitted.
  preloadedProject?: Doc<"projects"> | null
): Promise<"write" | "read" | null> {
  const project =
    preloadedProject !== undefined
      ? preloadedProject
      : await ctx.db.get(account.projectId);
  if (!project || project.deletedAt) return null;

  return resolveResourceAccess(ctx, {
    userId,
    projectId: account.projectId,
    organizationId: project.organizationId,
    resourceEnvironments: account.environments,
    blanketWrite: "project.accounts.update",
    getGrant: () => getActiveAccountGrant(ctx, userId, account._id),
  });
}

/**
 * The active per-file grant for a user, or null.
 *
 * Exact mirror of getActiveAccountGrant: a (file, user) pair can accumulate
 * several rows as revoked history builds up, so scan for the live one rather
 * than trusting `.first()`.
 */
export async function getActiveFileGrant(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  fileId: Id<"projectFiles">
): Promise<Doc<"filePermissions"> | null> {
  const grants = await ctx.db
    .query("filePermissions")
    .withIndex("by_file_and_user", (q) =>
      q.eq("fileId", fileId).eq("userId", userId)
    )
    .collect();

  return (
    grants.find(
      (g) => g.isActive && (!g.expiresAt || g.expiresAt > Date.now())
    ) ?? null
  );
}

/**
 * Compute a user's effective access to a single secret file.
 *
 *   "write" — can replace the contents or edit the metadata
 *   "read"  — can download it
 *   null    — no access
 *
 * EXACT mirror of getAccountAccess, which is itself a mirror of
 * getVariableAccess. Same environment-scope-first ordering: an out-of-scope
 * file is invisible to a scoped developer even when a grant exists.
 */
export async function getFileAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  file: Doc<"projectFiles">,
  // Caller-supplied project doc when it was already fetched, avoiding a
  // duplicate read of the same row. Falls back to fetching when omitted.
  preloadedProject?: Doc<"projects"> | null
): Promise<"write" | "read" | null> {
  const project =
    preloadedProject !== undefined
      ? preloadedProject
      : await ctx.db.get(file.projectId);
  if (!project || project.deletedAt) return null;

  return resolveResourceAccess(ctx, {
    userId,
    projectId: file.projectId,
    organizationId: project.organizationId,
    resourceEnvironments: file.environments,
    blanketWrite: "project.files.update",
    getGrant: () => getActiveFileGrant(ctx, userId, file._id),
  });
}
