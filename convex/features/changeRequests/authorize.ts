import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  requireAccountAccess,
  requireFileAccess,
  requireVariableAccess,
} from "../../lib/authHelpers";
import { assertOrgAction, assertProjectAction } from "../../lib/authz";
import { touchedEnvironments } from "../../lib/protection";
import { isWorkspace } from "../../lib/projectKind";

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
  | "rollback"
  | "share";

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

/** What the proposal is allowed to write, as the server derives it. */
export type AuthorizedChange = {
  /** The row being written. Null for a create, which has none yet. */
  target: ChangeTarget | null;
  /**
   * What the write touches before the payload's own environments are added:
   * the target's current set, plus for a rollback the historical version's,
   * which rollbackCore restores.
   */
  currentEnvironments: string[];
};

/**
 * The environments the named version spans, and proof that it exists. A
 * rollback restores them, so a proposal that omits them would file a
 * production rollback as an unprotected change; a version that is missing
 * would only fail at approval, leaving the request stuck as pending.
 */
async function rollbackVersionEnvironments(
  ctx: QueryCtx,
  variableId: Id<"environmentVariables">,
  targetVersion: number | undefined
): Promise<string[]> {
  if (targetVersion === undefined) {
    throw new ConvexError("A rollback request needs a version to restore");
  }
  const version = await ctx.db
    .query("variableVersions")
    .withIndex("by_variable_and_version", (q) =>
      q.eq("variableId", variableId).eq("version", targetVersion)
    )
    .first();
  if (!version) {
    throw new ConvexError(
      `Version ${targetVersion} does not exist for this variable`
    );
  }
  return version.environments;
}

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
  args: {
    resourceType: ResourceType;
    kind: ChangeKind;
    targetId?: string;
    /** The version a rollback restores; required for that kind. */
    targetVersion?: number;
  }
): Promise<AuthorizedChange> {
  const { resourceType, kind, targetId } = args;

  // Only variables keep a version history to roll back to.
  if (kind === "rollback" && resourceType !== "variable") {
    throw new ConvexError("Rollback is only supported for variables");
  }

  // rollbackCore requires this org-level capability on the apply path, so a
  // requester without it could only ever file a request nobody can apply.
  if (kind === "rollback") {
    await assertOrgAction(
      ctx,
      actorId,
      project.organizationId,
      "org:rollback_variable"
    );
  }

  if (kind === "create") {
    await assertProjectAction(
      ctx,
      actorId,
      project._id,
      CREATE_ACTIONS[resourceType],
      project
    );
    return { target: null, currentEnvironments: [] };
  }
  // A share targets a row that still lives in a member project; the group
  // is the request's project because its protection is the members' union.
  if (kind === "share") {
    if (resourceType !== "variable" || !isWorkspace(project)) {
      throw new ConvexError("Only variables can be shared into a group");
    }
    const id = targetId
      ? ctx.db.normalizeId("environmentVariables", targetId)
      : null;
    const variable = id ? await ctx.db.get(id) : null;
    if (!variable || variable.deletedAt) {
      throw new ConvexError("Target variable not found");
    }
    await assertProjectAction(
      ctx,
      actorId,
      variable.projectId,
      "project:manage_workspaces"
    );
    return { target: variable, currentEnvironments: variable.environments };
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
      return { target: account, currentEnvironments: account.environments };
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
      return { target: file, currentEnvironments: file.environments };
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
      return {
        target: variable,
        currentEnvironments:
          kind === "rollback"
            ? touchedEnvironments(
                variable.environments,
                await rollbackVersionEnvironments(
                  ctx,
                  variable._id,
                  args.targetVersion
                )
              )
            : variable.environments,
      };
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
  return { target, currentEnvironments: target.environments };
}
