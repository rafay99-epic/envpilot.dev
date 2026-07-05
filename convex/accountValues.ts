import { v } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Composed shared-account credential actions — Stage 3, Phase 3.
 *
 * The direct-to-Convex replacements for the WorkOS Vault calls that POST
 * /api/accounts and PATCH /api/accounts/[id] used to make in apps/web. Credential
 * plaintext now travels to Convex, which encrypts it into WorkOS Vault via the
 * internal vault primitive and persists only the opaque ref.
 *
 * Identity: unlike the variables mutations (which derive identity from ctx), the
 * accounts mutations take an explicit convex user Id. Because these are PUBLIC
 * actions, the current user's _id is resolved from the verified JWT identity
 * here — NEVER accepted as an arg — so a caller cannot impersonate another user.
 *
 * ZERO-DATA-LOSS: the vault payload is byte-identical to the route's
 * serializeAccountVault (`{"username","password"}`); refs pass through untouched;
 * create rolls back a newly minted ref if the insert fails, and rotate restores
 * the previous credentials in place if the update mutation rejects.
 */

/** Resolve the current caller's convex user _id from the verified JWT. */
async function requireCurrentUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: no verified user identity on request");
  }
  const user = await ctx.runQuery(api.users.getByWorkosId, {
    workosId: identity.subject,
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user._id;
}

/** Vault payload for an account — byte-identical to lib/account-payload's serializeAccountVault. */
function serializeAccountVault(username: string, password: string): string {
  return JSON.stringify({ username, password });
}

/**
 * Replaces the WorkOS Vault write path of POST /api/accounts. Encrypts the
 * credentials first, then inserts the account with the returned ref; a failed
 * insert best-effort deletes the now-orphaned vault object (same ordering as the
 * route's create-rollback).
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
  returns: v.object({ accountId: v.id("projectAccounts") }),
  handler: async (ctx, args): Promise<{ accountId: Id<"projectAccounts"> }> => {
    const userId = await requireCurrentUserId(ctx);

    const project = await ctx.runQuery(api.projects.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    // The project's own organizationId is authoritative for the vault key
    // context and the mutation — never a client-supplied value.
    const vault = await ctx.runAction(internal.vault.createSecret, {
      name: `account:${args.name}:${Date.now()}`,
      value: serializeAccountVault(args.username, args.password),
      organizationId: project.organizationId,
      projectId: args.projectId,
      environment: "account",
    });

    let accountId: Id<"projectAccounts">;
    try {
      accountId = await ctx.runMutation(api.accounts.create, {
        projectId: args.projectId,
        createdBy: userId,
        name: args.name,
        websiteUrl: args.websiteUrl,
        description: args.description,
        environments: args.environments,
        vaultRef: vault.id,
      });
    } catch (mutationError) {
      try {
        await ctx.runAction(internal.vault.deleteSecret, {
          vaultRef: vault.id,
        });
      } catch {
        // Best-effort — vaultGc reconciles any straggler.
      }
      throw mutationError;
    }

    return { accountId };
  },
});

/**
 * Replaces the WorkOS Vault read/update path of PATCH /api/accounts/[id]. When
 * both username and password are present the credentials are rewritten IN PLACE
 * (same vaultRef, new version) after snapshotting the previous value, so a
 * mutation rejection can roll the vault object back — Vault and Convex stay
 * consistent with the HTTP result. Metadata-only updates never touch Vault.
 *
 * The route validates the username/password pairing (both-or-neither) and
 * returns 400 before calling this, so a lone credential here is treated as
 * metadata-only.
 */
export const updateWithCredentials = action({
  args: {
    accountId: v.id("projectAccounts"),
    name: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    password: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
  },
  returns: v.object({ accountId: v.id("projectAccounts") }),
  handler: async (ctx, args): Promise<{ accountId: Id<"projectAccounts"> }> => {
    const userId = await requireCurrentUserId(ctx);

    const credentialsChanged =
      args.username !== undefined && args.password !== undefined;

    // Resolve the account + its vaultRef and verify access server-side. Require
    // WRITE when rotating credentials so the request is rejected BEFORE any
    // vault write; metadata-only stays on READ (the mutation still enforces
    // write and no vault write happens).
    const account = await ctx.runQuery(api.accounts.get, {
      accountId: args.accountId,
      userId,
      minimumAccess: credentialsChanged ? "write" : "read",
    });

    let previousVaultValue: string | null = null;
    if (credentialsChanged) {
      previousVaultValue = await ctx.runAction(internal.vault.readSecret, {
        vaultRef: account.vaultRef,
      });
      await ctx.runAction(internal.vault.updateSecret, {
        vaultRef: account.vaultRef,
        value: serializeAccountVault(args.username!, args.password!),
      });
    }

    try {
      await ctx.runMutation(api.accounts.update, {
        accountId: args.accountId,
        userId,
        name: args.name,
        websiteUrl: args.websiteUrl,
        description: args.description,
        environments: args.environments,
        credentialsChanged,
      });
    } catch (mutationError) {
      // Compensating rollback: restore the prior credentials so a failed
      // request does not leave the account's vault value mutated.
      if (previousVaultValue !== null) {
        try {
          await ctx.runAction(internal.vault.updateSecret, {
            vaultRef: account.vaultRef,
            value: previousVaultValue,
          });
        } catch {
          // Best-effort — surfaced via the original mutation error below.
        }
      }
      throw mutationError;
    }

    return { accountId: args.accountId };
  },
});
