import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { bypassesAssignment, isEnvironmentScopeAllowed } from "../../lib/authz";
import {
  effectiveEnvironments,
  type RoleProfile,
} from "../../lib/roleProfiles";

/**
 * Who may see which change requests.
 *
 * Every list, count and detail read goes through here so a scoped member
 * never learns from a badge what listForProject hides from them: a pending
 * production change is itself information.
 */

/** Rows an org-wide read may scan while collecting the ones it may show. */
const MAX_ORG_SCAN = 1000;

/** The actor's standing on one project: assignment plus environment scope. */
export type ProjectRequestScope = {
  assigned: boolean;
  environmentScope?: string[];
};

/**
 * The actor's effective scope and assignment for every project they are
 * assigned to, in ONE indexed read — the org-wide lists and counts would
 * otherwise issue a membership query per row. Null means unrestricted
 * (owner class). Project-scoped callers get the same pair back from
 * assertProjectAction and pass it to canSeeRequest directly.
 */
export async function orgRequestScopes(
  ctx: QueryCtx,
  actorId: Id<"users">,
  profile: RoleProfile
): Promise<Map<string, ProjectRequestScope> | null> {
  if (bypassesAssignment(profile)) return null;
  const assignments = await ctx.db
    .query("projectMembers")
    .withIndex("by_user", (q) => q.eq("userId", actorId))
    .collect();
  const scopes = new Map<string, ProjectRequestScope>();
  for (const assignment of assignments) {
    scopes.set(assignment.projectId.toString(), {
      assigned: true,
      environmentScope: effectiveEnvironments(profile, assignment.environments),
    });
  }
  return scopes;
}

/**
 * Whether a request row is visible under the actor's standing. An ABSENT
 * scope is a project the actor is not assigned to; `assigned: false` from
 * assertProjectAction is the owner class, which bypasses assignment and
 * sees everything.
 */
export function canSeeRequest(
  scope: ProjectRequestScope | undefined,
  environments: string[]
): boolean {
  if (scope === undefined) return false;
  return isEnvironmentScopeAllowed(scope.environmentScope, environments);
}

/**
 * The first `limit` rows this actor may see, taken from the index lazily.
 * Filtering AFTER a take() drops accessible rows once inaccessible ones
 * fill the window, so the scan is bounded separately from the result.
 */
export async function collectVisibleInOrg<
  T extends { projectId: Id<"projects">; environments: string[] },
>(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  rows: AsyncIterable<T>,
  scopes: Map<string, ProjectRequestScope> | null,
  limit: number
): Promise<T[]> {
  const visible: T[] = [];
  // A project move re-tenants reviewed history in the background, so a row's
  // stored organizationId can lag. The project's CURRENT organization decides.
  const projectOrg = new Map<string, boolean>();
  let scanned = 0;
  for await (const row of rows) {
    const key = row.projectId.toString();
    let inOrg = projectOrg.get(key);
    if (inOrg === undefined) {
      const project = await ctx.db.get(row.projectId);
      inOrg = project?.organizationId === organizationId;
      projectOrg.set(key, inOrg);
    }
    if (
      inOrg &&
      (scopes === null || canSeeRequest(scopes.get(key), row.environments))
    ) {
      visible.push(row);
      if (visible.length >= limit) break;
    }
    if (++scanned >= MAX_ORG_SCAN) break;
  }
  return visible;
}
