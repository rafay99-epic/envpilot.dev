import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * The effective variable list for a project: its own rows plus everything it
 * inherits from the workspaces it belongs to.
 *
 * ACCESS MODEL (the part worth being explicit about): inheritance is granted
 * by PROJECT membership alone. A user who is not a member of the workspace,
 * who has never been named on it and cannot open it, still reads the values
 * it shares, because they can read a project that belongs to it. There is no
 * workspace member list to keep in sync, which is what lets the workspace be
 * one page instead of a second projects section. Environment scope still
 * applies: callers enforce it on the resolved list, exactly as they already
 * do on a project's own rows.
 *
 * Called by the project variable queries, api/reads.ts (REST, MCP, GitHub
 * Action, Docker image) and cicd/pull.ts. Resolution is server side, so no
 * client release is needed to pick this up.
 */

/**
 * Bounds the fan-out. Every resolve costs one indexed read per workspace, and
 * every variable write costs one conflict lookup per workspace, so this is a
 * correctness ceiling rather than a paywall.
 */
export const MAX_WORKSPACES_PER_PROJECT = 5;

export type VariableSource =
  | { kind: "own" }
  | { kind: "workspace"; workspaceId: Id<"projects">; name: string };

export type ResolvedVariable = Doc<"environmentVariables"> & {
  source: VariableSource;
};

export async function resolveEffectiveVariables(
  ctx: QueryCtx,
  args: { projectId: Id<"projects">; environment?: string }
): Promise<ResolvedVariable[]> {
  const own: ResolvedVariable[] = (
    await activeRows(ctx, args.projectId, args.environment)
  ).map((row) => ({ ...row, source: { kind: "own" } }));

  const memberships = await ctx.db
    .query("workspaceProjects")
    .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    .take(MAX_WORKSPACES_PER_PROJECT + 1);

  if (memberships.length > MAX_WORKSPACES_PER_PROJECT) {
    throw new ConvexError(
      `This project belongs to more than ${MAX_WORKSPACES_PER_PROJECT} workspaces. Remove one to keep pulls predictable.`
    );
  }

  const inherited: ResolvedVariable[] = [];

  for (const membership of memberships) {
    const workspace = await ctx.db.get(membership.workspaceId);
    // A soft-deleted workspace stops sharing immediately. Members lose the
    // keys on their next pull rather than reading rows queued for purge.
    if (!workspace || workspace.deletedAt !== undefined) continue;

    for (const row of await activeRows(ctx, membership.workspaceId)) {
      // Absent appliesTo = every member project, and it keeps following
      // membership as projects join. Present = exactly that list.
      if (row.appliesTo && !row.appliesTo.includes(args.projectId)) continue;
      if (args.environment && !row.environments.includes(args.environment)) {
        continue;
      }

      inherited.push({
        ...row,
        source: {
          kind: "workspace",
          workspaceId: workspace._id,
          name: workspace.name,
        },
      });
    }
  }

  const resolved = [...own, ...inherited];
  assertNoDuplicatePairs(resolved);
  return resolved;
}

/** Active rows of one project, optionally narrowed to one environment. */
async function activeRows(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  environment?: string
): Promise<Doc<"environmentVariables">[]> {
  const rows = await ctx.db
    .query("environmentVariables")
    .withIndex("by_project_deleted", (q) =>
      q.eq("projectId", projectId).eq("deletedAt", undefined)
    )
    .collect();

  return environment
    ? rows.filter((row) => row.environments.includes(environment))
    : rows;
}

/**
 * Strict inheritance means a duplicate (key, environment) pair cannot be
 * written: findEnvironmentConflicts refuses one at every write path. Reaching
 * this is therefore a bug, not a user situation, so it fails loudly instead
 * of picking a winner and shipping the wrong secret to a deploy.
 */
function assertNoDuplicatePairs(rows: ResolvedVariable[]): void {
  const claimed = new Map<string, string>();

  for (const row of rows) {
    const owner = row.source.kind === "own" ? "this project" : row.source.name;

    for (const environment of row.environments) {
      const pair = `${row.key} ${environment}`;
      const existing = claimed.get(pair);
      if (existing !== undefined) {
        throw new ConvexError(
          `"${row.key}" resolves to two variables in ${environment} (${existing} and ${owner}). Refusing to guess which value is correct.`
        );
      }
      claimed.set(pair, owner);
    }
  }
}
