import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertProjectAction,
  getVariableAccess,
  getAccountAccess,
  getFileAccess,
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
    // Pass the project doc when the caller already fetched it, so
    // assertProjectAction doesn't read the same row again.
    preloadedProject?: Doc<"projects"> | null;
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
    args.action,
    args.preloadedProject
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
  minimum: "read" | "write",
  // Pass the project doc when the caller already fetched it, so
  // getVariableAccess doesn't read the same row again.
  preloadedProject?: Doc<"projects"> | null
): Promise<"read" | "write"> {
  // Verify user exists
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  const access = await getVariableAccess(
    ctx,
    userId,
    variable,
    preloadedProject
  );
  if (!access || (minimum === "write" && access !== "write")) {
    throw new Error("Insufficient permissions");
  }

  return access;
}

/**
 * Authorize a user for a project-scoped account operation.
 *
 * Account analog of authorizeVariableAccess — same unified-role contract:
 * capability is a function of the caller's ORG role, gated on their
 * projectMembers assignment (owners bypass). Returns the normalized org role
 * and assignment status so callers can branch (e.g. auto-granting write to
 * developers on accounts they create).
 */
export async function authorizeAccountAccess(
  ctx: MutationCtx | QueryCtx,
  args: {
    userId: Id<"users">;
    projectId: Id<"projects">;
    action: ProjectAction;
    // Pass the project doc when the caller already fetched it, so
    // assertProjectAction doesn't read the same row again.
    preloadedProject?: Doc<"projects"> | null;
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
    args.action,
    args.preloadedProject
  );
}

/**
 * Require a minimum effective access level on a single account.
 *
 * Delegates to getAccountAccess:
 *   owner → write; assigned project_manager/team_lead → write;
 *   assigned developer → per-account grant decides;
 *   unassigned org member with an active grant → read.
 *
 * Returns the effective access level on success, throws otherwise.
 */
export async function requireAccountAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  account: Doc<"projectAccounts">,
  minimum: "read" | "write",
  // Pass the project doc when the caller already fetched it, so
  // getAccountAccess doesn't read the same row again.
  preloadedProject?: Doc<"projects"> | null
): Promise<"read" | "write"> {
  // Verify user exists
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  const access = await getAccountAccess(ctx, userId, account, preloadedProject);
  if (!access || (minimum === "write" && access !== "write")) {
    throw new Error("Insufficient permissions");
  }

  return access;
}

/**
 * Authorize a user for a project-scoped secret-file operation.
 *
 * File analog of authorizeAccountAccess — same unified-role contract:
 * capability is a function of the caller's ORG role, gated on their
 * projectMembers assignment (owners bypass). Returns the normalized org role
 * and assignment status so callers can branch (e.g. auto-granting write to
 * developers on files they upload).
 */
export async function authorizeFileAccess(
  ctx: MutationCtx | QueryCtx,
  args: {
    userId: Id<"users">;
    projectId: Id<"projects">;
    action: ProjectAction;
    // Pass the project doc when the caller already fetched it, so
    // assertProjectAction doesn't read the same row again.
    preloadedProject?: Doc<"projects"> | null;
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
    args.action,
    args.preloadedProject
  );
}

/**
 * Require a minimum effective access level on a single secret file.
 *
 * Delegates to getFileAccess:
 *   owner → write; assigned project_manager/team_lead → write;
 *   assigned developer → per-file grant decides;
 *   unassigned org member with an active grant → read.
 *
 * Returns the effective access level on success, throws otherwise.
 */
export async function requireFileAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  file: Doc<"projectFiles">,
  minimum: "read" | "write",
  // Pass the project doc when the caller already fetched it, so getFileAccess
  // doesn't read the same row again.
  preloadedProject?: Doc<"projects"> | null
): Promise<"read" | "write"> {
  // Verify user exists
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  const access = await getFileAccess(ctx, userId, file, preloadedProject);
  if (!access || (minimum === "write" && access !== "write")) {
    throw new Error("Insufficient permissions");
  }

  return access;
}
