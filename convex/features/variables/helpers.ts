import { ConvexError } from "convex/values";
import type { DatabaseReader, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countRotationEnabledVariables,
} from "../featureRegistry/gates";
import type { OrgGateContext } from "../featureRegistry/resolver";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  profileToLegacyProjectRole,
  hasCapability,
  effectiveEnvironments,
  environmentAccessMessage,
  type RoleProfile,
} from "../../lib/authz";

/**
 * Environment Variable shared helpers
 */

/**
 * Throw when a scoped developer touches environments outside their assignment
 * scope. No-op for unrestricted (undefined) scopes — see authz.ts.
 */
export function assertWithinEnvironmentScope(
  scope: string[] | undefined,
  environments: string[]
): void {
  if (isEnvironmentScopeAllowed(scope, environments)) return;
  const blocked = environments.find((env) => !(scope ?? []).includes(env))!;
  throw new ConvexError(environmentAccessMessage(blocked));
}

/** Widest rotation window a variable may carry, in days. */
const MAX_ROTATION_DAYS = 3650;
/** Tags one variable may carry. */
const MAX_TAGS_PER_VARIABLE = 10;

/**
 * Everything createCore validates about a create's non-secret fields:
 * rotation bounds and gating, and tag ownership. The protected-create path
 * runs it BEFORE minting a vault object and filing a proposal, so an
 * out-of-range rotation window or a foreign tag is refused immediately
 * instead of at approval time, with the request stuck and its secret staged.
 * Returns the deduplicated tag ids to store.
 */
export async function validateVariableCreateFields(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    rotationFrequencyDays?: number;
    tagIds?: Id<"variableTags">[];
  },
  gate?: OrgGateContext
): Promise<Id<"variableTags">[] | undefined> {
  const rotationDays = args.rotationFrequencyDays;
  if (
    rotationDays !== undefined &&
    (rotationDays < 0 || rotationDays > MAX_ROTATION_DAYS)
  ) {
    throw new ConvexError(
      `Rotation frequency must be between 0 and ${MAX_ROTATION_DAYS} days`
    );
  }

  // Dual gate: rotation is a boolean feature with a per-org cap on how many
  // variables may schedule it.
  if (rotationDays !== undefined && rotationDays > 0) {
    const rotationCheck = await checkBooleanFeature(
      db,
      args.organizationId,
      "secret_rotation",
      gate
    );
    if (!rotationCheck.allowed) {
      throw new ConvexError(
        "Secret rotation requires a higher tier. Upgrade to enable rotation schedules."
      );
    }

    // Limit-first: skips the org-wide fan-out when rotation is unlimited.
    const limitCheck = await checkCountedLimit(
      db,
      args.organizationId,
      "secret_rotation_limit",
      (limit) =>
        countRotationEnabledVariables(
          db,
          args.organizationId,
          undefined,
          limit
        ),
      gate
    );
    if (!limitCheck.allowed) {
      throw new ConvexError(
        `Rotation-enabled variable limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your tier for more.`
      );
    }
  }

  const tagIds =
    args.tagIds && args.tagIds.length > 0
      ? [...new Set(args.tagIds)]
      : undefined;
  if (tagIds === undefined) return undefined;

  if (tagIds.length > MAX_TAGS_PER_VARIABLE) {
    throw new ConvexError(
      `A variable can have at most ${MAX_TAGS_PER_VARIABLE} tags`
    );
  }
  for (const tagId of tagIds) {
    const tag = await db.get(tagId);
    if (!tag || tag.deletedAt) {
      throw new ConvexError(`Tag not found: ${tagId}`);
    }
    if (tag.organizationId !== args.organizationId) {
      throw new ConvexError("Tag does not belong to this organization");
    }
  }
  return tagIds;
}

/**
 * Build a variableId → active grant lookup from a caller's grant rows.
 *
 * Collapses the same (variable, user) revocation history that
 * getActiveVariableGrant scans per call into a single Map so list queries
 * can resolve grants without an indexed read per variable. Mirrors
 * getActiveVariableGrant's selection exactly: only rows that are active and
 * unexpired qualify, and the first such row per variable wins (matching its
 * `.find(...)`). Callers should pass rows already filtered to isActive=true
 * (e.g. via the by_user_active index).
 */
export function buildActiveGrantMap(
  grants: Doc<"variablePermissions">[]
): Map<string, Doc<"variablePermissions">> {
  const now = Date.now();
  const byVariable = new Map<string, Doc<"variablePermissions">>();
  for (const grant of grants) {
    if (!grant.isActive) continue;
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.variableId as string;
    if (!byVariable.has(key)) byVariable.set(key, grant);
  }
  return byVariable;
}

type OrgRole = ReturnType<typeof normalizeOrgRole>;
type ProjectRole = ReturnType<typeof profileToLegacyProjectRole>;

/**
 * The per-project access context shared by listWithAccess and
 * listWithAccessPaginated: the caller's resolved unified role, project
 * assignment/scope, blanket-access flags, and a prefetched grant map. Both
 * queries source their variable page differently (take vs paginate) but
 * derive every per-row access decision from this identical context.
 */
export type VariableAccessContext = {
  orgRole: OrgRole;
  /** Resolved capability profile — the single per-request resolution. */
  profile: RoleProfile;
  isOwner: boolean;
  assigned: boolean;
  environmentScope: string[] | undefined;
  roleAccess: boolean;
  canManagePermissions: boolean;
  projectRole: ProjectRole;
  grantByVariable: Map<string, Doc<"variablePermissions">>;
};

/**
 * Resolve the caller's access context for a single project, shared verbatim by
 * listWithAccess (take-windowed) and listWithAccessPaginated (cursor-paged).
 *
 * Returns null when the project is missing/deleted or the caller is not an org
 * member — each caller maps that to its own "empty" shape (an empty array for
 * the take variant, an empty pagination result for the paginated variant),
 * preserving both queries' existing early-return behavior exactly.
 */
export async function resolveProjectAccessContext(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
): Promise<{ project: Doc<"projects">; access: VariableAccessContext } | null> {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    return null;
  }

  // Get user's org membership to determine their unified role. A suspended
  // member resolves to null here — the security-hold denial for the highest
  // -traffic variable read paths (listWithAccess and its paginated sibling).
  const membership = await getActiveMembership(
    ctx,
    project.organizationId,
    userId
  );

  if (!membership) {
    return null;
  }

  const orgRole = normalizeOrgRole(membership.role);
  // ONE profile resolution per request (cost rule) — every per-row decision
  // below derives from this context, never from slug comparisons.
  const profile = await getRoleProfile(ctx, orgRole);
  const isOwner = bypassesAssignment(profile);

  // Assignment is a pure scope check — projectMembers.role is legacy
  // and never consulted for authorization.
  let assigned = false;
  let environmentScope: string[] | undefined;
  if (!isOwner) {
    const projectMembership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", projectId).eq("userId", userId)
      )
      .first();
    assigned = !!projectMembership;
    // Only an ASSIGNMENT carries a scope. A grant-only user has no assignment,
    // and applying the role default to them would hide variables that were
    // shared with them explicitly.
    environmentScope = projectMembership
      ? effectiveEnvironments(profile, projectMembership.environments)
      : undefined;
  }

  // The owner class and assigned blanket-write roles have write access
  const roleAccess =
    isOwner || (assigned && hasCapability(profile, "project.variables.update"));
  const canManagePermissions =
    isOwner ||
    (assigned && hasCapability(profile, "project.permissions.manage"));
  const projectRole = profileToLegacyProjectRole(profile, assigned);

  // Prefetch the caller's active grants ONCE instead of one indexed query
  // per variable (getActiveVariableGrant N+1). by_user_active already
  // filters to isActive=true; drop expired grants and dedupe to the first
  // active/unexpired grant per variable — the exact row
  // getActiveVariableGrant would have returned.
  const grantByVariable = buildActiveGrantMap(
    await ctx.db
      .query("variablePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .collect()
  );

  return {
    project,
    access: {
      orgRole,
      profile,
      isOwner,
      assigned,
      environmentScope,
      roleAccess,
      canManagePermissions,
      projectRole,
      grantByVariable,
    },
  };
}

/**
 * Map one variable to the access-annotated row shape shared by listWithAccess
 * and listWithAccessPaginated.
 *
 * Mirrors getVariableAccess: owner → write; assigned PM/TL → write; developers
 * per grant; unassigned grant holders capped at read. Vault refs are only
 * returned for variables the user can access; assigned members still see
 * metadata for the rest.
 */
export function mapVariableRow(
  variable: Doc<"environmentVariables">,
  access: VariableAccessContext
) {
  const {
    roleAccess,
    profile,
    assigned,
    orgRole,
    projectRole,
    canManagePermissions,
    grantByVariable,
  } = access;

  const grant = grantByVariable.get(variable._id as string) ?? null;

  let effectiveAccess: "write" | "read" | null = null;
  if (roleAccess) {
    effectiveAccess = "write";
  } else if (assigned && hasCapability(profile, "access.blanket_read")) {
    // Auditor class: every in-scope variable, read-only, no grants involved.
    effectiveAccess = "read";
  } else if (grant) {
    effectiveAccess =
      !assigned || grant.permission === "read"
        ? "read"
        : hasCapability(profile, "access.grant_fallback")
          ? "write"
          : "read";
  }

  const hasAccess = effectiveAccess !== null;
  // "admin" marks rows whose holder may manage permissions — decoupled from
  // blanket write so write-only roles never surface management UI.
  const effectivePermission = canManagePermissions
    ? "admin"
    : roleAccess
      ? "write"
      : effectiveAccess;

  const { vaultRef, ...metadata } = variable;

  return {
    ...metadata,
    ...(hasAccess ? { vaultRef } : {}),
    hasAccess,
    permission: effectivePermission,
    roleAccess,
    userRole: orgRole,
    projectRole,
    canManagePermissions,
  };
}

/**
 * Per-environment key uniqueness: the same key MAY exist on multiple active
 * variables in a project as long as their `environments` arrays are disjoint
 * (e.g. DATABASE_URL for [development] and DATABASE_URL for [production] are
 * two variables with independent values). This helper returns the list of
 * environments that would clash for a proposed (key, environments) pair —
 * empty result means the create/update is allowed. The invariant this
 * preserves: every (key, environment) pair resolves to AT MOST ONE active
 * variable, which keeps CLI pull/push, extension sync, and the public API
 * deterministic without any client changes.
 */
export async function findEnvironmentConflicts(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    key: string;
    environments: string[];
    excludeVariableId?: Id<"environmentVariables">;
  }
): Promise<string[]> {
  // Defense-in-depth at the shared write-path choke point: an empty
  // environments array would make the variable invisible to every
  // environment-filtered read (CLI run/pull, extension sync, public API)
  // while still appearing in the dashboard. Web/MCP zod already rejects
  // this; Convex validators alone would not.
  if (args.environments.length === 0) {
    throw new ConvexError("At least one environment is required");
  }

  const sameKey = await ctx.db
    .query("environmentVariables")
    .withIndex("by_project_and_key", (q) =>
      q.eq("projectId", args.projectId).eq("key", args.key)
    )
    .collect();

  const clashes = new Set<string>();
  for (const existing of sameKey) {
    if (existing.deletedAt) continue;
    if (args.excludeVariableId && existing._id === args.excludeVariableId) {
      continue;
    }
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }
  return [...clashes];
}

/** Standard user-facing message for a per-environment key clash. */
export function environmentConflictMessage(
  key: string,
  clashes: string[]
): string {
  return `Variable "${key}" already exists in environment(s): ${clashes.join(", ")}. The same key is allowed only across non-overlapping environments.`;
}

/**
 * Per-environment key clashes WITHIN one incoming batch.
 *
 * `findEnvironmentConflicts` compares a key against rows already in the
 * database, which is everything a single create needs: two conflicting creates
 * arrive as separate requests and the second one loses to the first. A batch
 * has no first. Two items in the same array claiming DATABASE_URL for
 * [production] must be refused before anything is written to the vault, or
 * the transaction fails partway and every minted secret has to be unwound.
 *
 * Environments are deduped per item, so a sloppy ["dev", "dev"] on ONE
 * variable is not a clash; only overlap ACROSS items is.
 */
export function findBatchInternalConflicts(
  items: readonly { key: string; environments: readonly string[] }[]
): { key: string; clashes: string[] }[] {
  const claimedByKey = new Map<string, Set<string>>();
  const clashesByKey = new Map<string, Set<string>>();

  for (const item of items) {
    let claimed = claimedByKey.get(item.key);
    if (!claimed) {
      claimed = new Set<string>();
      claimedByKey.set(item.key, claimed);
    }
    for (const env of new Set(item.environments)) {
      if (claimed.has(env)) {
        let clashes = clashesByKey.get(item.key);
        if (!clashes) {
          clashes = new Set<string>();
          clashesByKey.set(item.key, clashes);
        }
        clashes.add(env);
      }
      claimed.add(env);
    }
  }

  return [...clashesByKey].map(([key, clashes]) => ({
    key,
    clashes: [...clashes],
  }));
}

/** Bounds shared by every variable write path. */
export const MAX_VARIABLE_KEY_LENGTH = 100;
export const MAX_VARIABLE_DESCRIPTION_LENGTH = 500;

/**
 * A variable key is an environment-variable identifier: a letter or
 * underscore, then letters, digits or underscores.
 *
 * Deliberately the PERMISSIVE form. The dashboard and the template flow
 * require SCREAMING_SNAKE at their entry points, but `pushBulk` has always
 * accepted lowercase-leading keys from the CLI, and tightening the shared
 * choke point would start rejecting pushes that work today.
 */
const VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Non-throwing form, for paths that SKIP bad keys instead of failing. */
export function isValidVariableKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= MAX_VARIABLE_KEY_LENGTH &&
    VARIABLE_KEY_PATTERN.test(key)
  );
}

/**
 * Validate the fields every create path shares.
 *
 * This lived in the zod schema on POST /api/variables. With the browser
 * calling Convex directly that route is gone, and `createWithValue` — which
 * the CLI has always used — never checked any of it. So an unvalidated key or
 * an unbounded description could be written by any direct caller. Enforced in
 * createCore, which is the one function every create path goes through.
 */
export function assertValidVariableFields(args: {
  key: string;
  description?: string;
}): void {
  if (args.key.length === 0 || args.key.length > MAX_VARIABLE_KEY_LENGTH) {
    throw new ConvexError(
      `Variable key must be between 1 and ${MAX_VARIABLE_KEY_LENGTH} characters`
    );
  }
  if (!VARIABLE_KEY_PATTERN.test(args.key)) {
    throw new ConvexError(
      `"${args.key}" is not a valid variable key. Use letters, digits and underscores, starting with a letter or underscore.`
    );
  }
  if (
    args.description !== undefined &&
    args.description.length > MAX_VARIABLE_DESCRIPTION_LENGTH
  ) {
    throw new ConvexError(
      `Description must be ${MAX_VARIABLE_DESCRIPTION_LENGTH} characters or less`
    );
  }
}
