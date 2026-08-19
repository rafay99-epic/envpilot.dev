import { v } from "convex/values";
import { action, query } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { requireAuthedUser } from "../../lib/identity";
import { getVariableAccess, getAccountAccess } from "../../lib/authz";
import { isWorkspace } from "../../lib/projectKind";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

/**
 * Browser value-reveal path — Stage 3.
 *
 * The dashboard reveals a single secret value by its opaque `vaultRef` (the eye
 * icon on a variable/account row, and the diff view). Stage 3 moved vault crypto
 * into Convex and deleted the old `/api/vault` route + `lib/vault.ts`; this is
 * its identity-scoped replacement.
 *
 * SECURITY: `internal.features.vault.vault.readSecret` has no authorization of its own, so this
 * public action must fully authorize the caller BEFORE reading. Authorization is
 * done by RESOURCE, not by a client-supplied org id: we reverse-look-up the row
 * that owns the ref and run the same per-resource access check the rest of the
 * app uses (getVariableAccess / getAccountAccess). A ref that belongs to no
 * accessible variable/version/account is refused — closing the IDOR the old
 * server-only route avoided by never exposing readSecret.
 */

/**
 * Can the authenticated caller read the value behind this vaultRef? Checks the
 * three tables that store refs: current variable values, historical version
 * values, and shared-account credentials.
 */
export const canRevealVaultRef = query({
  args: { vaultRef: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);

    // 1. Current variable value.
    const variable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_vaultRef", (q) => q.eq("vaultRef", args.vaultRef))
      .first();
    if (variable) {
      if (variable.deletedAt) return false;
      if ((await getVariableAccess(ctx, actor._id, variable)) !== null) {
        return true;
      }
      // A workspace-owned value is readable through any member project the
      // caller can read. Without this the feature contradicts itself: the row
      // lists on the project's page and then refuses to reveal for exactly
      // the people it was shared with.
      return await canRevealThroughWorkspace(ctx, actor._id, variable);
    }

    // 2. Historical version value (diff view). Access follows the parent
    //    variable — version rows have no independent authorization.
    const version = await ctx.db
      .query("variableVersions")
      .withIndex("by_vaultRef", (q) => q.eq("vaultRef", args.vaultRef))
      .first();
    if (version) {
      const parent = await ctx.db.get(version.variableId);
      if (!parent || parent.deletedAt) return false;
      return (await getVariableAccess(ctx, actor._id, parent)) !== null;
    }

    // 3. Shared-account credentials.
    const account = await ctx.db
      .query("projectAccounts")
      .withIndex("by_vaultRef", (q) => q.eq("vaultRef", args.vaultRef))
      .first();
    if (account) {
      if (account.deletedAt) return false;
      return (await getAccountAccess(ctx, actor._id, account)) !== null;
    }

    // Unknown ref → not authorized (fail closed).
    return false;
  },
});

/**
 * Workspace inheritance for the reveal path.
 *
 * Access to a shared value comes from membership of a project that reads it,
 * never from being named on the workspace. This asks the SAME per-project
 * check the rest of the app uses, once per member project, by evaluating a
 * copy of the row as though it lived in that project — so environment scope
 * and per-variable grants keep applying unchanged instead of being
 * re-implemented here.
 */
async function canRevealThroughWorkspace(
  ctx: QueryCtx,
  userId: Id<"users">,
  variable: Doc<"environmentVariables">
): Promise<boolean> {
  const owner = await ctx.db.get(variable.projectId);
  if (!owner || !isWorkspace(owner)) return false;

  const memberships = await ctx.db
    .query("workspaceProjects")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", variable.projectId))
    .collect();

  for (const membership of memberships) {
    if (
      variable.appliesTo &&
      !variable.appliesTo.includes(membership.projectId)
    ) {
      continue;
    }

    const carried = membership.environments
      ? variable.environments.filter((environment) =>
          membership.environments?.includes(environment)
        )
      : variable.environments;
    if (carried.length === 0) continue;

    const project = await ctx.db.get(membership.projectId);
    if (!project || project.deletedAt) continue;

    const access = await getVariableAccess(
      ctx,
      userId,
      { ...variable, projectId: membership.projectId, environments: carried },
      project
    );
    if (access !== null) return true;
  }

  return false;
}

/**
 * Reveal the decrypted value behind a vaultRef, gated by {@link canRevealVaultRef}.
 */
export const reveal = action({
  args: { vaultRef: v.string() },
  returns: v.object({ value: v.string() }),
  handler: async (ctx, args): Promise<{ value: string }> => {
    const allowed = await ctx.runQuery(
      api.features.vault.reveal.canRevealVaultRef,
      {
        vaultRef: args.vaultRef,
      }
    );
    if (!allowed) {
      throw new Error("Forbidden: no access to this secret");
    }
    const value = await ctx.runAction(
      internal.features.vault.vault.readSecret,
      {
        vaultRef: args.vaultRef,
      }
    );
    return { value };
  },
});
