import type { DatabaseReader } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { resolveFeatureValue, type OrgGateContext } from "./resolver";

// ==========================================
// PAGINATION SHAPE (structural — matches Convex's query builder return type)
// ==========================================

/**
 * Minimal shape shared by Convex's `OrderedQuery` builder — just enough to
 * paginate a single index range without pulling in the full query-builder
 * generic type at every call site.
 */
type Pageable<Doc> = {
  paginate: (opts: {
    cursor: string | null;
    numItems: number;
  }) => Promise<{ page: Doc[]; isDone: boolean; continueCursor: string }>;
  collect: () => Promise<Doc[]>;
};

// ==========================================
// CONVENIENCE FUNCTIONS (for use in mutations)
// ==========================================

/**
 * Check a boolean feature for an organization.
 * Returns { allowed, reason, tierName }.
 *
 * Pass `context` (from `resolveOrgGateContext`) when checking this org
 * against another feature key in the same request — e.g. the dual-gate
 * pattern pairing this with `checkNumericLimit`/`checkCountedLimit` for a
 * `*_limit` companion feature — to reuse the org/tier/grace resolution
 * instead of re-fetching it.
 */
export async function checkBooleanFeature(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string,
  context?: OrgGateContext
): Promise<{ allowed: boolean; reason?: string; tierName: string }> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    featureKey,
    context
  );
  const allowed = resolved.value === true;
  return {
    allowed,
    tierName: resolved.tierName,
    reason: allowed
      ? undefined
      : `${featureKey.replace(/_/g, " ")} requires a higher tier.`,
  };
}

/**
 * Check a numeric limit for an organization against current usage.
 * Returns { allowed, current, limit, reason, tierName }.
 */
export async function checkNumericLimit(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string,
  currentCount: number,
  context?: OrgGateContext
): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  reason?: string;
  tierName: string;
}> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    featureKey,
    context
  );
  const limit = resolved.value as number | null;

  if (limit === null) {
    // Unlimited
    return {
      allowed: true,
      current: currentCount,
      limit: null,
      tierName: resolved.tierName,
    };
  }

  const allowed = currentCount < limit;
  return {
    allowed,
    current: currentCount,
    limit,
    tierName: resolved.tierName,
    reason: allowed
      ? undefined
      : `Limit reached (${currentCount}/${limit}). Upgrade your tier for more.`,
  };
}

/**
 * Limit-first numeric check for an organization.
 *
 * Resolves the feature's numeric limit BEFORE counting anything. When the
 * limit is unlimited (`null` — either because the tier grants it or because
 * tier enforcement is off), `countFn` is never invoked, so a gated create
 * path pays zero extra read cost on the common "unlimited" path. When a
 * finite limit exists, `countFn` receives it and can use it to bound its own
 * read (e.g. `countActiveVariables(db, projectId, limit)`), so a per-project
 * or per-org fan-out count only reads as many rows as needed to prove the
 * limit is exceeded rather than every row in the table.
 *
 * Prefer this over `checkNumericLimit` for any call site whose count is
 * itself expensive (org-wide fan-out across projects, etc). `checkNumericLimit`
 * stays available for callers with an already-cheap or already-computed count.
 */
export async function checkCountedLimit(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string,
  countFn: (limit: number) => Promise<number>,
  context?: OrgGateContext
): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  reason?: string;
  tierName: string;
}> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    featureKey,
    context
  );
  const limit = resolved.value as number | null;

  if (limit === null) {
    // Unlimited (or enforcement disabled) — never count.
    return {
      allowed: true,
      current: 0,
      limit: null,
      tierName: resolved.tierName,
    };
  }

  const currentCount = await countFn(limit);
  const allowed = currentCount < limit;
  return {
    allowed,
    current: currentCount,
    limit,
    tierName: resolved.tierName,
    reason: allowed
      ? undefined
      : `Limit reached (${currentCount}/${limit}). Upgrade your tier for more.`,
  };
}

// ==========================================
// COUNT HELPERS (reusable across mutations)
// ==========================================

/**
 * Count documents from `query` matching `isCounted`, optionally bounded by
 * `limit`.
 *
 * - `limit === undefined`: collects the full range and filters in memory —
 *   identical to the original unbounded behavior. Used by display/usage
 *   paths (e.g. the usage dashboard) that need an exact total regardless of
 *   size.
 * - `limit` given: pages through the range and stops as soon as the running
 *   count exceeds `limit` (the `< limit` decision downstream is already
 *   determined at that point, so reading further can't change the outcome)
 *   or the range is exhausted. This is NOT a flat `.take(limit + 1)` on raw
 *   rows — `deletedAt` (and, for rotation, `rotationFrequencyDays`) aren't
 *   part of the index, so a naive raw-row cap could under-count real matches
 *   sitting behind a run of non-matching rows. Paginating and filtering each
 *   page keeps the bound correct while still avoiding a full table scan in
 *   the common case (limit reached within the first page or two).
 */
async function countMatchingUpTo<Doc>(
  makeQuery: () => Pageable<Doc>,
  isCounted: (doc: Doc) => boolean,
  limit: number | undefined
): Promise<number> {
  // Single read via collect() + in-memory filter — NOT a .paginate() loop.
  // Convex forbids more than one paginate() call per function execution, and
  // the multi-project fan-out (countActiveAccounts / countRotationEnabled-
  // Variables) calls this once per project, so any paginate-based approach
  // crashed those paths outright. collect() is correct and cheap here: a
  // finite `limit` only exists for FREE-tier scopes — unlimited/Pro tiers
  // early-return in checkCountedLimit before counting — so the scanned range
  // is inherently bounded by the (small) tier cap plus not-yet-purged trash.
  // `limit` is accepted for signature stability with the display path but
  // does not change the read strategy.
  void limit;
  const rows = await makeQuery().collect();
  return rows.filter(isCounted).length;
}

export async function countActiveProjects(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  const projects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  return projects.filter((p) => p.deletedAt === undefined).length;
}

/**
 * Count active (non-deleted) variables in a project.
 *
 * Pass `limit` (the resolved tier limit) to bound the read — the count stops
 * as soon as it's proven to exceed the limit instead of collecting every
 * variable in the project. Omit `limit` for an exact total (e.g. dashboards).
 */
export async function countActiveVariables(
  db: DatabaseReader,
  projectId: Id<"projects">,
  limit?: number
): Promise<number> {
  return countMatchingUpTo(
    () =>
      db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", projectId)),
    (v) => v.deletedAt === undefined,
    limit
  );
}

export async function countMembersAndPendingInvites(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  const now = Date.now();
  const [members, invites] = await Promise.all([
    db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect(),
    db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect(),
  ]);
  const pendingInvites = invites.filter(
    (i) => i.status === "pending" && i.expiresAt > now
  );
  return members.length + pendingInvites.length;
}

/**
 * Count rotation-enabled (non-deleted) variables across every live project
 * of an organization.
 *
 * Pass `limit` (the resolved `secret_rotation_limit`) to bound the fan-out —
 * the project loop short-circuits as soon as the running total is proven to
 * exceed the limit, instead of collecting every variable of every project.
 * Omit `limit` for an exact total (e.g. the usage dashboard).
 */
export async function countRotationEnabledVariables(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  excludeVariableId?: Id<"environmentVariables">,
  limit?: number
): Promise<number> {
  const allProjects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const projects = allProjects.filter((p) => p.deletedAt === undefined);

  const isRotationEnabled = (v: {
    deletedAt?: number;
    rotationFrequencyDays?: number;
    _id: Id<"environmentVariables">;
  }) =>
    v.deletedAt === undefined &&
    v.rotationFrequencyDays !== undefined &&
    v.rotationFrequencyDays > 0 &&
    !(excludeVariableId !== undefined && v._id === excludeVariableId);

  let count = 0;
  for (const project of projects) {
    if (limit !== undefined && count >= limit) break; // capacity provably full — no need to scan remaining projects

    const remaining = limit === undefined ? undefined : limit - count;
    count += await countMatchingUpTo(
      () =>
        db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id)),
      isRotationEnabled,
      remaining
    );
  }
  return count;
}

/**
 * Count an organization's notification webhooks (Slack/Discord). Disabled
 * rows still occupy a slot — the limit caps configured endpoints, not
 * currently-firing ones. The read stops at the resolved tier limit because
 * reaching that count is already sufficient to deny another endpoint.
 */
export async function countConfiguredWebhooks(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  limit: number
): Promise<number> {
  const denialThreshold = Math.ceil(limit);
  if (denialThreshold <= 0) return 0;
  const hooks = await db
    .query("orgWebhooks")
    .withIndex("by_organization_and_deleted_at", (q) =>
      q.eq("organizationId", organizationId).eq("deletedAt", undefined)
    )
    .take(denialThreshold);
  return hooks.length;
}

/**
 * Count active (non-deleted) shared accounts across an organization.
 * Iterates the org's live projects and their by_project account rows,
 * excluding soft-deleted accounts — used by the shared_accounts_limit gate.
 */
export async function countActiveAccounts(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  limit?: number
): Promise<number> {
  const allProjects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const projects = allProjects.filter((p) => p.deletedAt === undefined);

  let count = 0;
  for (const project of projects) {
    if (limit !== undefined && count >= limit) break; // capacity provably full — no need to scan remaining projects

    const remaining = limit === undefined ? undefined : limit - count;
    count += await countMatchingUpTo(
      () =>
        db
          .query("projectAccounts")
          .withIndex("by_project", (q) => q.eq("projectId", project._id)),
      (a) => a.deletedAt === undefined,
      remaining
    );
  }
  return count;
}

/**
 * Count active (non-deleted) secret files across an organization's projects.
 *
 * Genuinely bounded, unlike a countMatchingUpTo delegation: that helper
 * collect()s a project's whole range and ignores its `limit`, so the
 * free-tier gate would scan every file row of every project — exactly the
 * scan the bound is supposed to avoid — and report an inflated current
 * count like "5/3". This takes `remaining + 1` rows per project and stops
 * as soon as capacity is provably full.
 *
 * Unlimited (Pro) tiers early-return in checkCountedLimit before this runs.
 */
export async function countActiveFiles(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  limit?: number
): Promise<number> {
  const allProjects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const projects = allProjects.filter((p) => p.deletedAt === undefined);

  let count = 0;
  for (const project of projects) {
    if (limit !== undefined && count >= limit) break;

    const query = db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", project._id));

    if (limit === undefined) {
      const rows = await query.collect();
      count += rows.filter((f) => f.deletedAt === undefined).length;
      continue;
    }

    // One more than we need: enough to prove the limit is exceeded without
    // reading the rest of the project.
    const remaining = limit - count;
    const rows = await query.take(remaining + 1);
    count += rows.filter((f) => f.deletedAt === undefined).length;
  }
  return count;
}
