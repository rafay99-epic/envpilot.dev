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

/** Whether a request row is visible under the actor's standing. */
export function canSeeRequest(
  scope: ProjectRequestScope | undefined,
  environments: string[]
): boolean {
  if (!scope?.assigned) return false;
  return isEnvironmentScopeAllowed(scope.environmentScope, environments);
}

/** Rows an actor with this org-wide standing may see. */
export function visibleInOrg<
  T extends { projectId: Id<"projects">; environments: string[] },
>(rows: T[], scopes: Map<string, ProjectRequestScope> | null): T[] {
  if (scopes === null) return rows;
  return rows.filter((row) =>
    canSeeRequest(scopes.get(row.projectId.toString()), row.environments)
  );
}
