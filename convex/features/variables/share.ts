import { v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

/**
 * Composed shared-secret actions — Stage 3, Phase 3.
 *
 * The direct-to-Convex replacements for the WorkOS Vault calls that the
 * apps/web share routes used to make. The client-encrypted ciphertext now
 * travels to Convex, which stores it in WorkOS Vault via the internal primitive.
 *
 * PUBLIC vs AUTHED authorization:
 *  - createWithPayload / revokeAndPurge run the AUTHED mutations
 *    (sharedSecrets.createShare / revokeShare) which derive identity from the
 *    JWT (requireAuthedUser) and enforce org membership / resource access /
 *    admin — the route calls these with the caller's token.
 *  - verifyOtpAndReveal is the recipient flow: NO session, NO requireAuthedUser.
 *    Authorization is the share token + email + OTP hash validated atomically by
 *    sharedSecrets.verifyOtp (with lockout + rate limiting). This action only
 *    orchestrates verify → vault read → (one-time) vault delete, exactly as the
 *    public route did.
 *
 * ZERO-DATA-LOSS: refs pass byte-for-byte; the one-time delete is best-effort
 * and only runs AFTER the ciphertext was read; a create whose share insert
 * fails best-effort deletes the orphaned vault object.
 */

export const createWithPayload = action({
  args: {
    token: v.string(),
    encryptedPayload: v.string(),
    variableKey: v.string(),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    resourceType: v.optional(
      v.union(v.literal("variable"), v.literal("account"))
    ),
    variableId: v.optional(v.id("environmentVariables")),
    accountId: v.optional(v.id("projectAccounts")),
    mode: v.union(v.literal("one_time"), v.literal("time_limited")),
    expiresAt: v.number(),
    hasPassphrase: v.boolean(),
    recipientEmails: v.array(v.string()),
  },
  returns: v.object({ shareId: v.id("sharedSecrets") }),
  handler: async (ctx, args): Promise<{ shareId: Id<"sharedSecrets"> }> => {
    // Auth BEFORE any vault write — createShare (below) re-checks org/creator
    // gating, but we must not let an unauthenticated direct caller churn vault
    // objects. A public action is reachable without the withAuth'd route.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: sign-in required to create a share");
    }

    // Store the client-encrypted ciphertext in WorkOS Vault first.
    const vault = await ctx.runAction(internal.vault.createSecret, {
      name: `share:${args.variableKey}:${Date.now()}`,
      value: args.encryptedPayload,
      organizationId: args.organizationId,
      projectId: args.projectId,
      environment: "share",
    });

    try {
      const result = await ctx.runMutation(api.sharedSecrets.createShare, {
        token: args.token,
        vaultRef: vault.id,
        resourceType: args.resourceType,
        variableId: args.variableId,
        accountId: args.accountId,
        variableKey: args.variableKey,
        organizationId: args.organizationId,
        projectId: args.projectId,
        mode: args.mode,
        expiresAt: args.expiresAt,
        hasPassphrase: args.hasPassphrase,
        recipientEmails: args.recipientEmails,
      });
      return { shareId: result.shareId };
    } catch (mutationError) {
      // createShare enforces gating + rate limiting; on rejection the vault
      // object is referenced by nothing, so best-effort delete it.
      try {
        await ctx.runAction(internal.vault.deleteSecret, {
          vaultRef: vault.id,
        });
      } catch {
        // Best-effort.
      }
      throw mutationError;
    }
  },
});

/**
 * Recipient flow (PUBLIC — no session). Validates + burns the OTP via the
 * mutation, then reads the ciphertext from Vault, then (for one-time shares)
 * best-effort deletes the vault object. A vault read failure is surfaced as a
 * distinguishable error so the route can map it to 502 (matching the old route,
 * which returned 502 separately from OTP errors).
 */
export const verifyOtpAndReveal = action({
  args: {
    token: v.string(),
    email: v.string(),
    otpHash: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({
    encryptedPayload: v.string(),
    hasPassphrase: v.boolean(),
    resourceType: v.union(v.literal("variable"), v.literal("account")),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    encryptedPayload: string;
    hasPassphrase: boolean;
    resourceType: "variable" | "account";
  }> => {
    const result = await ctx.runMutation(api.sharedSecrets.verifyOtp, {
      token: args.token,
      email: args.email,
      otpHash: args.otpHash,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    let encryptedPayload: string;
    try {
      encryptedPayload = await ctx.runAction(internal.vault.readSecret, {
        vaultRef: result.vaultRef,
      });
    } catch {
      // verifyOtp already burned a one-time share before we got here, so a
      // transient Vault read failure would destroy the link for good. Un-burn it
      // so the recipient can request a fresh OTP and retry.
      if (result.mode === "one_time") {
        try {
          await ctx.runMutation(api.sharedSecrets.restoreBurnedShare, {
            token: args.token,
          });
        } catch {
          // Best-effort — the reveal error below is what the recipient sees.
        }
      }
      throw new Error("SHARE_VAULT_READ_FAILED");
    }

    // For one-time shares, delete the vault entry (best-effort) after reading.
    if (result.mode === "one_time") {
      try {
        await ctx.runAction(internal.vault.deleteSecret, {
          vaultRef: result.vaultRef,
        });
      } catch {
        // Best-effort — vaultGc reconciles any straggler.
      }
    }

    return {
      encryptedPayload,
      hasPassphrase: result.hasPassphrase,
      resourceType: result.resourceType,
    };
  },
});

/**
 * Revoke a share (AUTHED — creator or org team_lead+, enforced by revokeShare),
 * then best-effort delete its vault object. Mirrors the revoke route ordering.
 */
export const revokeAndPurge = action({
  args: {
    shareId: v.id("sharedSecrets"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const result = await ctx.runMutation(api.sharedSecrets.revokeShare, {
      shareId: args.shareId,
    });

    try {
      await ctx.runAction(internal.vault.deleteSecret, {
        vaultRef: result.vaultRef,
      });
    } catch {
      // Best-effort — vaultGc reconciles any straggler.
    }

    return { success: true };
  },
});
