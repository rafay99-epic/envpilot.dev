import { v, ConvexError } from "convex/values";
import { action, type ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { touchedEnvironments } from "../../lib/protection";

/** Resolve the caller's convex user _id from the verified JWT. */
async function requireCurrentUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError(
      "Unauthenticated: no verified user identity on request"
    );
  }
  const user = await ctx.runQuery(api.features.users.users.getByWorkosId, {
    workosId: identity.subject,
  });
  if (!user) {
    throw new ConvexError("User not found");
  }
  return user._id;
}

/**
 * File a variable change request from web, CLI, extension or MCP.
 *
 * Only actions may talk to WorkOS Vault, so the proposed value is minted
 * here and the request carries a ref, never plaintext. If the mutation
 * refuses (scope, dedupe, cap, unprotected environment), the freshly minted
 * object is unreferenced and is deleted best-effort.
 */
export const createVariableChange = action({
  args: {
    projectId: v.id("projects"),
    kind: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete"),
      v.literal("restore"),
      v.literal("rollback")
    ),
    variableId: v.optional(v.id("environmentVariables")),
    key: v.optional(v.string()),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    isSensitive: v.optional(v.boolean()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
    // Version to restore, for kind "rollback".
    targetVersion: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.union(
      v.literal("web"),
      v.literal("cli"),
      v.literal("mcp"),
      v.literal("extension")
    ),
  },
  returns: v.object({ requestId: v.id("changeRequests") }),
  handler: async (ctx, args): Promise<{ requestId: Id<"changeRequests"> }> => {
    const userId = await requireCurrentUserId(ctx);

    // The full authorization the mutation applies, run BEFORE the vault
    // write: minting first would let any signed-in user leave orphaned
    // secrets in any project's key context and probe which projects exist.
    await ctx.runQuery(
      internal.features.changeRequests.queries.canProposeVariableChange,
      {
        userId,
        projectId: args.projectId,
        kind: args.kind,
        variableId: args.variableId,
        environments: args.environments,
      }
    );

    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      { projectId: args.projectId }
    );
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const target = args.variableId
      ? await ctx.runQuery(
          internal.features.changeRequests.queries._targetSnapshot,
          { variableId: args.variableId }
        )
      : null;

    const label = args.key ?? target?.key;
    if (label === undefined) {
      throw new ConvexError("A variable key is required");
    }

    // What the write touches: the union of the target's current
    // environments and the proposed ones.
    const environments = touchedEnvironments(
      target?.environments,
      args.environments
    );
    if (environments.length === 0) {
      throw new ConvexError("At least one environment is required");
    }

    let vaultRef: string | undefined;
    if (typeof args.value === "string") {
      const vault = await ctx.runAction(
        internal.features.vault.vault.createSecret,
        {
          name: label,
          value: args.value,
          organizationId: project.organizationId,
          projectId: args.projectId,
        }
      );
      vaultRef = vault.id;
    }

    const payload: Record<string, unknown> = {};
    if (args.key !== undefined) payload.key = args.key;
    if (args.description !== undefined) payload.description = args.description;
    if (args.environments !== undefined) {
      payload.environments = args.environments;
    }
    if (args.isSensitive !== undefined) payload.isSensitive = args.isSensitive;
    if (args.tagIds !== undefined) payload.tagIds = args.tagIds;
    if (args.targetVersion !== undefined) {
      payload.targetVersion = args.targetVersion;
    }

    try {
      const requestId = await ctx.runMutation(
        internal.features.changeRequests.mutations.createStaged,
        {
          projectId: args.projectId,
          resourceType: "variable",
          kind: args.kind,
          targetId: args.variableId,
          environments,
          payload: JSON.stringify(payload),
          vaultRef,
          label,
          reason: args.reason,
          source: args.source,
        }
      );
      return { requestId };
    } catch (error) {
      if (vaultRef) {
        await ctx
          .runAction(internal.features.vault.vault.deleteSecret, { vaultRef })
          .catch(() => {});
      }
      throw error;
    }
  },
});
