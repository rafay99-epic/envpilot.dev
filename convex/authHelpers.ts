import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertProjectAction,
  getVariableAccess,
  type ProjectAction,
} from "./authz";

/**
 * Authorize a user for a project-scoped variable operation.
 *
 * Thin wrapper around the unified-role contract in authz.ts: what a user
 * can do in a project is a function of their ORG role, gated on their
 * projectMembers assignment (owners bypass the assignment check).
 *
 * Returns the caller's normalized org role and assignment status so
 * callers can branch on it (e.g. auto-granting write to developers on
 * variables they create).
 */
export async function authorizeVariableAccess(
  ctx: MutationCtx | QueryCtx,
  args: {
    userId: Id<"users">;
    projectId: Id<"projects">;
    action: ProjectAction;
  }
) {
  // Verify user exists
  const user = await ctx.db.get(args.userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  return await assertProjectAction(
    ctx,
    args.userId,
    args.projectId,
    args.action
  );
}

/**
 * Require a minimum effective access level on a single variable.
 *
 * Delegates to getVariableAccess:
 *   owner → write; assigned project_manager/team_lead → write;
 *   assigned developer → per-variable grant decides;
 *   unassigned org member with an active grant → read.
 *
 * Returns the effective access level on success, throws otherwise.
 */
export async function requireVariableAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  variable: Doc<"environmentVariables">,
  minimum: "read" | "write"
): Promise<"read" | "write"> {
  // Verify user exists
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  const access = await getVariableAccess(ctx, userId, variable);
  if (!access || (minimum === "write" && access !== "write")) {
    throw new Error("Insufficient permissions");
  }

  return access;
}
