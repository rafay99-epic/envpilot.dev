import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  requireAccountAccess,
  requireFileAccess,
  requireVariableAccess,
} from "../../lib/authHelpers";
import { assertProjectAction } from "../../lib/authz";

/**
 * The authorization a change request has to pass, shared by the mutation
 * that files one and the query an action calls BEFORE minting a vault
 * object for it.
 */

export type ResourceType = "variable" | "account" | "file";
export type ChangeKind =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "rollback";

/** The row a proposal targets. Null for a create, which has none yet. */
export type ChangeTarget =
  | Doc<"environmentVariables">
  | Doc<"projectAccounts">
  | Doc<"projectFiles">;

const CREATE_ACTIONS = {
  variable: "project:create_variable",
  account: "project:create_account",
  file: "project:create_file",
} as const;

const DELETE_ACTIONS = {
  variable: "project:delete_variable",
  account: "project:delete_account",
  file: "project:delete_file",
} as const;

/**
 * The proposal must be one the requester could have made directly if the
 * environment were not protected — protection adds a second approver, it
 * never grants access nobody had. Also proves the target exists and belongs
 * to the project the request is filed against, and hands it back so the
 * caller derives the stored version and environments from the row rather
 * than from the client.
 */
export async function assertCouldWriteDirectly(
  ctx: QueryCtx,
  actorId: Id<"users">,
  project: Doc<"projects">,
  args: { resourceType: ResourceType; kind: ChangeKind; targetId?: string }
): Promise<ChangeTarget | null> {
  const { resourceType, kind, targetId } = args;

  // Only variables keep a version history to roll back to.
  if (kind === "rollback" && resourceType !== "variable") {
    throw new ConvexError("Rollback is only supported for variables");
  }

  if (kind === "create") {
    await assertProjectAction(
      ctx,
      actorId,
      project._id,
      CREATE_ACTIONS[resourceType],
      project
    );
    return null;
  }

  const isWrite = kind === "update" || kind === "rollback";
  const notFound = `Target ${resourceType} not found`;
  let target: ChangeTarget;

  if (resourceType === "account") {
    const id = targetId
      ? ctx.db.normalizeId("projectAccounts", targetId)
      : null;
    const account = id ? await ctx.db.get(id) : null;
    if (!account || account.projectId !== project._id) {
      throw new ConvexError(notFound);
    }
    if (isWrite) {
      await requireAccountAccess(ctx, actorId, account, "write", project);
      return account;
    }
    target = account;
  } else if (resourceType === "file") {
    const id = targetId ? ctx.db.normalizeId("projectFiles", targetId) : null;
    const file = id ? await ctx.db.get(id) : null;
    if (!file || file.projectId !== project._id) {
      throw new ConvexError(notFound);
    }
    if (isWrite) {
      await requireFileAccess(ctx, actorId, file, "write", project);
      return file;
    }
    target = file;
  } else {
    const id = targetId
      ? ctx.db.normalizeId("environmentVariables", targetId)
      : null;
    const variable = id ? await ctx.db.get(id) : null;
    if (!variable || variable.projectId !== project._id) {
      throw new ConvexError(notFound);
    }
    if (isWrite) {
      await requireVariableAccess(ctx, actorId, variable, "write", project);
      return variable;
    }
    target = variable;
  }

  await assertProjectAction(
    ctx,
    actorId,
    project._id,
    DELETE_ACTIONS[resourceType],
    project
  );
  return target;
}
