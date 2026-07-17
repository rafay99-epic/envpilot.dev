import { v, ConvexError } from "convex/values";
import { action } from "../../../_generated/server";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

/**
 * Composed account-request action — mirror of accounts/values.ts
 * createWithCredentials, but the insert lands in accountRequests instead of
 * projectAccounts. Encrypts the proposed credentials into WorkOS Vault first
 * (byte-identical payload shape to serializeAccountVault: {"username",
 * "password"}), then creates the request with the returned ref. Authorization
 * — assigned developer only, environment scoping, duplicate-pending guard —
 * is enforced by the mutation; a rejected insert best-effort deletes the
 * now-orphaned vault object (vaultGc reconciles any straggler).
 */
export const createWithCredentials = action({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    username: v.string(),
    password: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
  },
  returns: v.object({ requestId: v.id("accountRequests") }),
  handler: async (ctx, args): Promise<{ requestId: Id<"accountRequests"> }> => {
    const project = await ctx.runQuery(api.features.projects.queries.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new ConvexError("Project not found");
    }

    // PRE-CHECK before the vault write (repo rule: never orphan a secret).
    // The mutation below is authoritative, but every PREDICTABLE rejection —
    // wrong role, unassigned, out-of-scope environment — must fire before
    // the caller's credentials are encrypted into this org's vault context.
    // Without this, any authenticated user could push a secret into a
    // foreign org's vault (deleted only best-effort afterwards).
    const access = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      { projectId: args.projectId }
    );
    if (access.role !== "developer" || !access.assigned) {
      throw new ConvexError(
        "Only developers assigned to the project can request accounts. Owners, project managers, team leads, and editors create accounts directly."
      );
    }
    if (args.environments.length === 0) {
      throw new ConvexError("An account request needs at least one environment");
    }
    if (
      access.environmentScope !== null &&
      !args.environments.every((env) =>
        access.environmentScope!.includes(env)
      )
    ) {
      throw new ConvexError(
        `Your access is limited to these environments: ${access.environmentScope.join(", ")}`
      );
    }

    // The project's own organizationId is authoritative for the vault key
    // context — never a client-supplied value.
    const vault = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: `account:${args.name}:${Date.now()}`,
        value: JSON.stringify({
          username: args.username,
          password: args.password,
        }),
        organizationId: project.organizationId,
        projectId: args.projectId,
        environment: "account",
      }
    );

    let requestId: Id<"accountRequests">;
    try {
      requestId = await ctx.runMutation(
        api.features.accounts.requests.mutations.create,
        {
          projectId: args.projectId,
          name: args.name,
          websiteUrl: args.websiteUrl,
          description: args.description,
          environments: args.environments,
          vaultRef: vault.id,
        }
      );
    } catch (mutationError) {
      try {
        await ctx.runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: vault.id,
        });
      } catch {
        // Best-effort — vaultGc reconciles any straggler.
      }
      throw mutationError;
    }

    return { requestId };
  },
});
