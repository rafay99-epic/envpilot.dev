import { v, ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { createAuditLog } from "../../lib/audit";
import {
  checkBooleanFeature,
  checkNumericLimit,
} from "../featureRegistry/gates";
import { rateLimiter } from "../../lib/rateLimits";
import {
  assertOrgMembership,
  getVariableAccess,
  getAccountAccess,
  roleLevel,
  ROLE_LEVEL,
} from "../../lib/authz";
import { normalizeResourceType, countActiveShares } from "./helpers";

/**
 * Shared Secrets — Convex Mutations & Queries
 *
 * Provides secure, time-limited secret sharing with email-verified OTP access.
 * All secret values are client-encrypted (AES-256-GCM) before reaching the server.
 * The server never sees plaintext — only ciphertext encrypted by a key held
 * exclusively in the URL fragment.
 */

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Create a new shared secret.
 * Called after the API route stores the encrypted payload in WorkOS Vault.
 *
 * Checks: auth, feature gate (secret_sharing + max_active_shares), rate limit.
 */
export const createShare = mutation({
  args: {
    token: v.string(),
    vaultRef: v.string(),
    // Which resource is being shared. Absent ⇒ "variable" (back-compat with
    // existing API callers that only pass variableId).
    resourceType: v.optional(
      v.union(v.literal("variable"), v.literal("account"))
    ),
    // Present for variable shares
    variableId: v.optional(v.id("environmentVariables")),
    // Present for account shares
    accountId: v.optional(v.id("projectAccounts")),
    // Display label — variable key OR account name
    variableKey: v.string(),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    mode: v.union(v.literal("one_time"), v.literal("time_limited")),
    expiresAt: v.number(),
    hasPassphrase: v.boolean(),
    recipientEmails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();
    const resourceType = normalizeResourceType(args);

    // 0. Authorization: the caller must be a member of the org AND have at
    // least read access to the resource being shared. Without this a member
    // could mint a share link for a resource they cannot see.
    // LOCKDOWN: sharing is team_lead+ (owner/PM/TL). Read access alone was
    // an exfiltration loophole — a read-only member could mail any secret to
    // an outside address. ConvexError so the denial survives prod redaction.
    const { membership: sharerMembership } = await assertOrgMembership(
      ctx,
      actor._id,
      args.organizationId
    );
    if (roleLevel(sharerMembership.role) < ROLE_LEVEL.team_lead) {
      throw new ConvexError(
        "Sharing secrets requires a team lead, project manager, or owner role. Ask your team lead to create the share."
      );
    }

    if (resourceType === "account") {
      if (!args.accountId) {
        throw new ConvexError("accountId is required for account shares");
      }
      const account = await ctx.db.get(args.accountId);
      if (!account || account.deletedAt) {
        throw new ConvexError("Account not found");
      }
      // The share row's org/project context must match where the account
      // actually lives — a member of two orgs must not be able to file a
      // share under the wrong org (skews audit logs + active-share limits).
      const accountProject = await ctx.db.get(account.projectId);
      if (
        account.projectId !== args.projectId ||
        accountProject?.organizationId !== args.organizationId
      ) {
        throw new ConvexError("Account not found");
      }
      const access = await getAccountAccess(ctx, actor._id, account);
      if (!access) {
        throw new ConvexError("You do not have access to this account");
      }
    } else {
      if (!args.variableId) {
        throw new ConvexError("variableId is required for variable shares");
      }
      const variable = await ctx.db.get(args.variableId);
      if (!variable || variable.deletedAt) {
        throw new ConvexError("Variable not found");
      }
      // Same org/project consistency guard as the account branch
      const variableProject = await ctx.db.get(variable.projectId);
      if (
        variable.projectId !== args.projectId ||
        variableProject?.organizationId !== args.organizationId
      ) {
        throw new ConvexError("Variable not found");
      }
      const access = await getVariableAccess(ctx, actor._id, variable);
      if (!access) {
        throw new ConvexError("You do not have access to this variable");
      }
    }

    // 0b. Reject self-sharing — the creator already has access to the resource,
    // and mailing themselves an OTP link is never the intent. Checked against
    // the creator's account email (case-insensitive), not just the current
    // recipient list, so it holds regardless of what the client sends.
    const creator = actor;
    const creatorEmail = creator?.email.toLowerCase().trim();
    if (
      creatorEmail &&
      args.recipientEmails.some((e) => e.toLowerCase().trim() === creatorEmail)
    ) {
      throw new ConvexError("You cannot share with your own email address.");
    }

    // 1. Feature gate: secret_sharing boolean
    const boolGate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "secret_sharing"
    );
    if (!boolGate.allowed) {
      throw new ConvexError(
        boolGate.reason ?? "Secret sharing is not enabled for your tier."
      );
    }

    // 2. Feature gate: max_active_shares numeric
    const activeCount = await countActiveShares(ctx.db, args.organizationId);
    const numGate = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "max_active_shares",
      activeCount
    );
    if (!numGate.allowed) {
      throw new ConvexError(numGate.reason ?? "Active share limit reached.");
    }

    // 3. Rate limit
    await rateLimiter.limit(ctx, "shareCreate", {
      key: args.organizationId,
      throws: true,
    });

    // 4. Insert sharedSecrets record
    const shareId = await ctx.db.insert("sharedSecrets", {
      token: args.token,
      vaultRef: args.vaultRef,
      resourceType,
      variableId: args.variableId,
      accountId: args.accountId,
      variableKey: args.variableKey,
      organizationId: args.organizationId,
      projectId: args.projectId,
      createdBy: actor._id,
      mode: args.mode,
      expiresAt: args.expiresAt,
      hasPassphrase: args.hasPassphrase,
      recipientEmails: args.recipientEmails.map((e) => e.toLowerCase().trim()),
      status: "active",
      totalViewCount: 0,
      createdAt: now,
    });

    // 5. Insert shareRecipients records
    for (const email of args.recipientEmails) {
      await ctx.db.insert("shareRecipients", {
        shareId,
        email: email.toLowerCase().trim(),
        otpAttempts: 0,
        otpVerified: false,
        hasViewed: false,
        createdAt: now,
      });
    }

    // 6. Audit log
    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      projectId: args.projectId,
      variableId: args.variableId,
      userId: actor._id,
      action: "share.created",
      details: {
        resourceType,
        accountId: args.accountId,
        variableKey: args.variableKey,
        mode: args.mode,
        recipientCount: args.recipientEmails.length,
        hasPassphrase: args.hasPassphrase,
        expiresAt: args.expiresAt,
      },
      involvesSensitiveData: true,
      resourceType: "security",
    });

    return { shareId };
  },
});

/**
 * Verify a recipient's email and generate an OTP.
 * Returns { success: true } regardless of whether the email matches
 * (to prevent email enumeration attacks).
 *
 * The actual OTP is returned separately so the API route can send it via email.
 * The hashed OTP is stored in shareRecipients.
 */
export const verifyRecipientEmail = mutation({
  args: {
    token: v.string(),
    email: v.string(),
    otpHash: v.string(), // SHA-256 hash of the 6-digit OTP (generated by API route)
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.toLowerCase().trim();

    // Rate limit
    await rateLimiter.limit(ctx, "shareVerifyEmail", {
      key: args.token,
      throws: true,
    });

    // Look up the share
    const share = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share || share.status !== "active" || share.expiresAt < now) {
      // Return success anyway to not leak info
      return { success: true, emailMatched: false };
    }

    // Find the recipient record
    const recipient = await ctx.db
      .query("shareRecipients")
      .withIndex("by_share_and_email", (q) =>
        q.eq("shareId", share._id).eq("email", email)
      )
      .first();

    if (!recipient) {
      // Email doesn't match — return success anyway (anti-enumeration)
      return { success: true, emailMatched: false };
    }

    // Check if already locked out (5+ attempts and OTP hasn't expired yet)
    if (
      recipient.otpAttempts >= 5 &&
      recipient.otpExpiresAt &&
      recipient.otpExpiresAt >= now
    ) {
      return { success: true, emailMatched: false };
    }

    // Only reset attempts if previous OTP expired (natural timeout, not lockout bypass)
    const shouldResetAttempts =
      !recipient.otpExpiresAt || recipient.otpExpiresAt < now;

    // Store the hashed OTP with 5-minute TTL
    await ctx.db.patch(recipient._id, {
      otpCode: args.otpHash,
      otpExpiresAt: now + 5 * 60 * 1000, // 5 minutes
      otpAttempts: shouldResetAttempts ? 0 : recipient.otpAttempts,
    });

    // Audit log
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      variableId: share.variableId,
      userId: share.createdBy,
      action: "share.otp_sent",
      details: {
        resourceType: normalizeResourceType(share),
        accountId: share.accountId,
        variableKey: share.variableKey,
        recipientEmail: email,
      },
      involvesSensitiveData: true,
      resourceType: "security",
    });

    return { success: true, emailMatched: true };
  },
});

/**
 * Compensating action for a one-time reveal whose Vault read failed AFTER
 * verifyOtp already burned the share. Un-burns it so a transient Vault outage
 * doesn't permanently destroy the link — the recipient can request a fresh OTP
 * and retry. No-op unless the share is a one-time share currently `burned`.
 */
export const restoreBurnedShare = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!share || share.mode !== "one_time" || share.status !== "burned") {
      return null;
    }
    await ctx.db.patch(share._id, {
      status: "active",
      burnedAt: undefined,
      totalViewCount: Math.max(0, share.totalViewCount - 1),
    });
    return null;
  },
});

/**
 * Verify the OTP and claim the shared secret.
 * For one-time shares, atomically burns the share.
 *
 * Returns { vaultRef, hasPassphrase } on success so the API route
 * can read the ciphertext from Vault and return it to the client.
 */
export const verifyOtp = mutation({
  args: {
    token: v.string(),
    email: v.string(),
    otpHash: v.string(), // SHA-256 hash of the user-provided OTP
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.toLowerCase().trim();

    // Rate limit
    await rateLimiter.limit(ctx, "shareVerifyOtp", {
      key: args.token,
      throws: true,
    });

    // Look up the share
    const share = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share) {
      throw new ConvexError("Share not found.");
    }

    if (share.status === "burned") {
      throw new ConvexError("This secret was already viewed and destroyed.");
    }

    if (share.status === "revoked") {
      throw new ConvexError("This share link was revoked by the owner.");
    }

    if (share.status === "expired" || share.expiresAt < now) {
      throw new ConvexError("This secret has expired.");
    }

    // Belt-and-braces: even if the delete-cascade missed this row (or raced),
    // never reveal a share whose underlying resource was soft-deleted. The
    // "revoked" phrase maps the route to 410 and the viewer to a terminal state.
    if (normalizeResourceType(share) === "account") {
      if (share.accountId) {
        const account = await ctx.db.get(share.accountId);
        if (!account || account.deletedAt) {
          throw new ConvexError(
            "This share was revoked because the shared account was deleted."
          );
        }
      }
    } else if (share.variableId) {
      const variable = await ctx.db.get(share.variableId);
      if (!variable || variable.deletedAt) {
        throw new ConvexError(
          "This share was revoked because the shared secret was deleted."
        );
      }
    }

    // Find the recipient
    const recipient = await ctx.db
      .query("shareRecipients")
      .withIndex("by_share_and_email", (q) =>
        q.eq("shareId", share._id).eq("email", email)
      )
      .first();

    if (!recipient) {
      throw new ConvexError("Email not authorized for this share.");
    }

    // Check lockout
    if (recipient.otpAttempts >= 5) {
      throw new ConvexError(
        "Too many failed attempts. This email has been locked out."
      );
    }

    // Check OTP exists and hasn't expired
    if (!recipient.otpCode || !recipient.otpExpiresAt) {
      throw new ConvexError(
        "No verification code found. Please request a new one."
      );
    }

    if (recipient.otpExpiresAt < now) {
      throw new ConvexError(
        "Verification code has expired. Please request a new one."
      );
    }

    // Verify OTP hash
    if (recipient.otpCode !== args.otpHash) {
      // Increment attempts
      const newAttempts = recipient.otpAttempts + 1;
      await ctx.db.patch(recipient._id, {
        otpAttempts: newAttempts,
      });

      // Audit log failed attempt
      await createAuditLog(ctx, {
        organizationId: share.organizationId,
        projectId: share.projectId,
        variableId: share.variableId,
        userId: share.createdBy,
        action: "share.otp_failed",
        details: {
          resourceType: normalizeResourceType(share),
          accountId: share.accountId,
          variableKey: share.variableKey,
          recipientEmail: email,
          attemptsUsed: newAttempts,
          ipAddress: args.ipAddress,
        },
        involvesSensitiveData: true,
        resourceType: "security",
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      });

      const remaining = 5 - newAttempts;
      throw new ConvexError(
        remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many failed attempts. This email has been locked out."
      );
    }

    // OTP is valid! Mark recipient as verified and viewed
    await ctx.db.patch(recipient._id, {
      otpVerified: true,
      otpCode: undefined, // Clear the OTP
      otpExpiresAt: undefined,
      hasViewed: true,
      viewedAt: now,
      viewerIpAddress: args.ipAddress,
      viewerUserAgent: args.userAgent,
    });

    // For one-time shares, atomically burn
    if (share.mode === "one_time") {
      await ctx.db.patch(share._id, {
        status: "burned",
        burnedAt: now,
        totalViewCount: share.totalViewCount + 1,
      });

      // Audit: burned
      await createAuditLog(ctx, {
        organizationId: share.organizationId,
        projectId: share.projectId,
        variableId: share.variableId,
        userId: share.createdBy,
        action: "share.burned",
        details: {
          resourceType: normalizeResourceType(share),
          accountId: share.accountId,
          variableKey: share.variableKey,
          viewedByEmail: email,
          ipAddress: args.ipAddress,
        },
        involvesSensitiveData: true,
        resourceType: "security",
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      });
    } else {
      // Time-limited: just increment view count
      await ctx.db.patch(share._id, {
        totalViewCount: share.totalViewCount + 1,
      });
    }

    // Audit: viewed
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      variableId: share.variableId,
      userId: share.createdBy,
      action: "share.viewed",
      details: {
        resourceType: normalizeResourceType(share),
        accountId: share.accountId,
        variableKey: share.variableKey,
        viewedByEmail: email,
        mode: share.mode,
        ipAddress: args.ipAddress,
      },
      involvesSensitiveData: true,
      resourceType: "security",
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    return {
      vaultRef: share.vaultRef,
      hasPassphrase: share.hasPassphrase,
      mode: share.mode,
      resourceType: normalizeResourceType(share),
    };
  },
});

/**
 * Revoke a shared secret. The creator, or any org member with at least the
 * team_lead role (owner / project_manager / team_lead), can revoke.
 */
export const revokeShare = mutation({
  args: {
    shareId: v.id("sharedSecrets"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) {
      throw new ConvexError("Share not found.");
    }

    // Check if user is creator OR at least a team lead in the org
    const isCreator = share.createdBy === actor._id;
    if (!isCreator) {
      try {
        await assertOrgMembership(
          ctx,
          actor._id,
          share.organizationId,
          "team_lead"
        );
      } catch (err) {
        console.error("sharedSecrets.revokeShare.denied", {
          shareId: args.shareId,
          userId: actor._id,
          organizationId: share.organizationId,
          error: String(err),
        });
        throw new ConvexError("Not authorized to revoke this share.");
      }
    }

    if (share.status !== "active") {
      throw new ConvexError(
        `Cannot revoke a share with status "${share.status}".`
      );
    }

    await ctx.db.patch(share._id, {
      status: "revoked",
      revokedAt: Date.now(),
      revokedBy: actor._id,
    });

    // Audit log
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      variableId: share.variableId,
      userId: actor._id,
      action: "share.revoked",
      details: {
        resourceType: normalizeResourceType(share),
        accountId: share.accountId,
        variableKey: share.variableKey,
        mode: share.mode,
      },
      involvesSensitiveData: true,
      resourceType: "security",
    });

    return { vaultRef: share.vaultRef };
  },
});
