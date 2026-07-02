import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { DatabaseReader, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { Id } from "./_generated/dataModel";
import { createAuditLog } from "./auditHelpers";
import { checkBooleanFeature, checkNumericLimit } from "./featureRegistry";
import { rateLimiter } from "./rateLimits";
import {
  assertOrgMembership,
  getVariableAccess,
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
} from "./authz";

// Upper bound on shares scanned by the list queries. Beyond this the oldest/
// least-relevant rows are dropped rather than blowing the per-query read
// budget; share lists are dashboards, not exhaustive exports.
const MAX_SHARE_SCAN = 500;

/**
 * Compute the caller's effective access ("read" | "write") to a batch of
 * variables in the fewest reads possible, mirroring authz.getVariableAccess
 * exactly. Callers pass the variableIds referenced by a set of shares; the
 * returned map only contains entries the caller can access (deleted variables,
 * missing projects, and no-access cases are omitted).
 *
 * Reads: variables (deduped) + projects (deduped) + one org-membership lookup
 * per distinct org + one project-membership lookup per distinct project + ONE
 * variablePermissions scan (by_user_active) for the caller's grants — instead
 * of getVariableAccess's full read fan-out per share.
 */
async function buildVariableAccessMap(
  ctx: QueryCtx,
  userId: Id<"users">,
  variableIds: Id<"environmentVariables">[]
): Promise<Map<string, "read" | "write">> {
  const now = Date.now();

  // Variables (deduped), dropping deleted ones.
  const uniqueVarIds = [...new Set(variableIds.map((id) => id.toString()))];
  const variableDocs = await Promise.all(
    uniqueVarIds.map((id) => ctx.db.get(id as Id<"environmentVariables">))
  );
  const varMap = new Map<string, Doc<"environmentVariables">>();
  for (const variable of variableDocs) {
    if (variable && !variable.deletedAt) {
      varMap.set(variable._id.toString(), variable);
    }
  }

  // Projects (deduped), dropping deleted ones.
  const projectIds = [
    ...new Set([...varMap.values()].map((va) => va.projectId.toString())),
  ];
  const projectDocs = await Promise.all(
    projectIds.map((id) => ctx.db.get(id as Id<"projects">))
  );
  const projMap = new Map<string, Doc<"projects">>();
  for (const project of projectDocs) {
    if (project && !project.deletedAt) {
      projMap.set(project._id.toString(), project);
    }
  }

  // Caller's org membership, one lookup per distinct org.
  const orgIds = [
    ...new Set([...projMap.values()].map((p) => p.organizationId.toString())),
  ];
  const membershipMap = new Map<string, Doc<"organizationMembers"> | null>();
  await Promise.all(
    orgIds.map(async (orgId) => {
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", orgId as Id<"organizations">)
            .eq("userId", userId)
        )
        .first();
      membershipMap.set(orgId, membership);
    })
  );

  // Caller's project membership, one lookup per distinct project.
  const projMemberMap = new Map<string, Doc<"projectMembers"> | null>();
  await Promise.all(
    projectIds.map(async (projectId) => {
      const pm = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", projectId as Id<"projects">).eq("userId", userId)
        )
        .first();
      projMemberMap.set(projectId, pm);
    })
  );

  // Caller's active, unexpired grants — a single indexed scan, keyed by
  // variableId (mirrors authz.getActiveVariableGrant's active+unexpired rule).
  const grants = await ctx.db
    .query("variablePermissions")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .collect();
  const grantMap = new Map<string, Doc<"variablePermissions">>();
  for (const grant of grants) {
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.variableId.toString();
    if (!grantMap.has(key)) grantMap.set(key, grant);
  }

  const accessMap = new Map<string, "read" | "write">();
  for (const variable of varMap.values()) {
    const project = projMap.get(variable.projectId.toString());
    if (!project) continue; // missing/deleted project → no access

    const membership = membershipMap.get(project.organizationId.toString());
    if (!membership) continue; // not an org member → no access

    const role = normalizeOrgRole(membership.role);
    if (role === "owner") {
      accessMap.set(variable._id.toString(), "write");
      continue;
    }

    const projectMembership = projMemberMap.get(variable.projectId.toString());

    if (
      projectMembership &&
      (role === "project_manager" || role === "team_lead")
    ) {
      accessMap.set(variable._id.toString(), "write");
      continue;
    }

    // Developers scoped to specific environments never see out-of-scope vars.
    if (
      projectMembership &&
      role === "developer" &&
      !isEnvironmentScopeAllowed(
        projectMembership.environments,
        variable.environments
      )
    ) {
      continue;
    }

    const grant = grantMap.get(variable._id.toString());
    if (!grant) continue; // no grant → no access

    // Unassigned members are capped at read (per-variable viewer sharing).
    if (!projectMembership) {
      accessMap.set(variable._id.toString(), "read");
      continue;
    }

    accessMap.set(
      variable._id.toString(),
      grant.permission === "read" ? "read" : "write"
    );
  }

  return accessMap;
}

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
    variableId: v.id("environmentVariables"),
    variableKey: v.string(),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    userId: v.id("users"),
    mode: v.union(v.literal("one_time"), v.literal("time_limited")),
    expiresAt: v.number(),
    hasPassphrase: v.boolean(),
    recipientEmails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 0. Authorization: the caller must be a member of the org AND have at
    // least read access to the variable being shared. Without this a member
    // could mint a share link for a variable they cannot see.
    await assertOrgMembership(ctx, args.userId, args.organizationId);
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }
    const access = await getVariableAccess(ctx, args.userId, variable);
    if (!access) {
      throw new Error("You do not have access to this variable");
    }

    // 1. Feature gate: secret_sharing boolean
    const boolGate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "secret_sharing"
    );
    if (!boolGate.allowed) {
      throw new Error(
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
      throw new Error(numGate.reason ?? "Active share limit reached.");
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
      variableId: args.variableId,
      variableKey: args.variableKey,
      organizationId: args.organizationId,
      projectId: args.projectId,
      createdBy: args.userId,
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
      userId: args.userId,
      action: "share.created",
      details: {
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
      throw new Error("Share not found.");
    }

    if (share.status === "burned") {
      throw new Error("This secret was already viewed and destroyed.");
    }

    if (share.status === "revoked") {
      throw new Error("This share link was revoked by the owner.");
    }

    if (share.status === "expired" || share.expiresAt < now) {
      throw new Error("This secret has expired.");
    }

    // Find the recipient
    const recipient = await ctx.db
      .query("shareRecipients")
      .withIndex("by_share_and_email", (q) =>
        q.eq("shareId", share._id).eq("email", email)
      )
      .first();

    if (!recipient) {
      throw new Error("Email not authorized for this share.");
    }

    // Check lockout
    if (recipient.otpAttempts >= 5) {
      throw new Error(
        "Too many failed attempts. This email has been locked out."
      );
    }

    // Check OTP exists and hasn't expired
    if (!recipient.otpCode || !recipient.otpExpiresAt) {
      throw new Error("No verification code found. Please request a new one.");
    }

    if (recipient.otpExpiresAt < now) {
      throw new Error(
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
      throw new Error(
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
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db.get(args.shareId);
    if (!share) {
      throw new Error("Share not found.");
    }

    // Check if user is creator OR at least a team lead in the org
    const isCreator = share.createdBy === args.userId;
    if (!isCreator) {
      try {
        await assertOrgMembership(
          ctx,
          args.userId,
          share.organizationId,
          "team_lead"
        );
      } catch {
        throw new Error("Not authorized to revoke this share.");
      }
    }

    if (share.status !== "active") {
      throw new Error(`Cannot revoke a share with status "${share.status}".`);
    }

    await ctx.db.patch(share._id, {
      status: "revoked",
      revokedAt: Date.now(),
      revokedBy: args.userId,
    });

    // Audit log
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      variableId: share.variableId,
      userId: args.userId,
      action: "share.revoked",
      details: {
        variableKey: share.variableKey,
        mode: share.mode,
      },
      involvesSensitiveData: true,
      resourceType: "security",
    });

    return { vaultRef: share.vaultRef };
  },
});

// ==========================================
// QUERIES
// ==========================================

/**
 * List shares for a specific variable, including recipient status.
 *
 * Authorization: the caller must have at least read access to the underlying
 * variable. The returned rows are stripped of the share `token` and `vaultRef`
 * — the UI only lists share status and never needs the lookup token or the
 * vault ciphertext reference.
 */
export const listByVariable = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Authorization: require variable access (read or write).
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }
    const access = await getVariableAccess(ctx, args.userId, variable);
    if (!access) {
      throw new Error("You do not have access to this variable");
    }

    const shares = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .take(MAX_SHARE_SCAN);

    // Enrich with recipient data
    const result = await Promise.all(
      shares.map(async (share) => {
        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        // Strip the share token and vaultRef — never surfaced to the listing.
        const { token: _token, vaultRef: _vaultRef, ...safe } = share;

        return {
          ...safe,
          recipients: recipients.map((r) => ({
            email: r.email,
            hasViewed: r.hasViewed,
            viewedAt: r.viewedAt,
            otpVerified: r.otpVerified,
          })),
        };
      })
    );

    return result;
  },
});

/**
 * List active shares across an organization (for dashboard widget).
 */
export const listActiveByOrg = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Require org membership; each share also exposes a variableKey, so it is
    // only surfaced when the caller has access to the underlying variable.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const shares = (
      await ctx.db
        .query("sharedSecrets")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .take(MAX_SHARE_SCAN)
    ).filter((share) => share.status === "active");

    // Resolve the caller's access to every referenced variable in one batched
    // pass instead of a full getVariableAccess fan-out per share.
    const accessMap = await buildVariableAccessMap(
      ctx,
      args.userId,
      shares.map((share) => share.variableId)
    );

    const enriched = await Promise.all(
      shares.map(async (share) => {
        // Drop shares whose underlying variable the caller can't access.
        if (!accessMap.has(share.variableId.toString())) return null;

        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        return {
          _id: share._id,
          variableKey: share.variableKey,
          mode: share.mode,
          expiresAt: share.expiresAt,
          totalViewCount: share.totalViewCount,
          recipientCount: recipients.length,
          viewedCount: recipients.filter((r) => r.hasViewed).length,
          createdAt: share.createdAt,
          createdBy: share.createdBy,
        };
      })
    );

    return enriched.filter(
      (row): row is NonNullable<typeof row> => row !== null
    );
  },
});

/**
 * List all shares for a specific project (all statuses), sorted by most recent.
 * Enriched with recipient data for admin/team-lead dashboards.
 */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    // Require org membership before surfacing share metadata.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const shares = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(MAX_SHARE_SCAN);

    // Sort by createdAt descending (most recent first)
    shares.sort((a, b) => b.createdAt - a.createdAt);

    // Resolve the caller's access to every referenced variable in one batched
    // pass instead of a full getVariableAccess fan-out per share.
    const accessMap = await buildVariableAccessMap(
      ctx,
      args.userId,
      shares.map((share) => share.variableId)
    );

    // Enrich with recipient data — drop shares whose underlying variable the
    // caller can't access (each row exposes variableKey + recipients).
    const enriched = await Promise.all(
      shares.map(async (share) => {
        if (!accessMap.has(share.variableId.toString())) return null;

        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        return {
          _id: share._id,
          variableKey: share.variableKey,
          mode: share.mode,
          status: share.status,
          expiresAt: share.expiresAt,
          hasPassphrase: share.hasPassphrase,
          totalViewCount: share.totalViewCount,
          createdAt: share.createdAt,
          createdBy: share.createdBy,
          recipients: recipients.map((r) => ({
            email: r.email,
            hasViewed: r.hasViewed,
            viewedAt: r.viewedAt,
            otpVerified: r.otpVerified,
          })),
        };
      })
    );

    return enriched.filter(
      (row): row is NonNullable<typeof row> => row !== null
    );
  },
});

/**
 * Count active shares for an organization (for numeric limit check).
 */
export const countActiveByOrg = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const shares = (
      await ctx.db
        .query("sharedSecrets")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
    ).filter((share) => share.status === "active");
    return shares.length;
  },
});

// ==========================================
// INTERNAL HELPERS
// ==========================================

export async function countActiveShares(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  const shares = (
    await db
      .query("sharedSecrets")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
  ).filter((share) => share.status === "active");
  return shares.length;
}

// ==========================================
// CRON HANDLERS (Internal Mutations)
// ==========================================

/**
 * Clean up expired shared secrets.
 * Transitions active shares past their expiresAt to "expired" status.
 */
export const cleanupExpiredShares = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Find active shares that have expired
    const expired = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "active").lt("expiresAt", now)
      )
      .collect();

    let count = 0;
    for (const share of expired) {
      await ctx.db.patch(share._id, {
        status: "expired",
      });

      // Audit log
      await createAuditLog(ctx, {
        organizationId: share.organizationId,
        projectId: share.projectId,
        variableId: share.variableId,
        userId: share.createdBy,
        action: "share.expired",
        details: {
          variableKey: share.variableKey,
          mode: share.mode,
          expiresAt: share.expiresAt,
        },
        involvesSensitiveData: true,
        resourceType: "security",
      });

      count++;
    }

    return { expired: count };
  },
});

/**
 * Clean up expired OTP codes from share recipients.
 * Clears OTP fields where the TTL has passed.
 */
export const cleanupExpiredOtps = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Only scan recipients whose OTP TTL has already elapsed, via the
    // by_otp_expires index — instead of a full-table scan every 30 minutes.
    // Rows with otpExpiresAt === undefined sort before all numbers and are
    // included by `.lt(now)`, so skip those cheaply (they have no OTP to clear).
    const expiredRecipients = await ctx.db
      .query("shareRecipients")
      .withIndex("by_otp_expires", (q) => q.lt("otpExpiresAt", now))
      .collect();

    let cleaned = 0;
    for (const recipient of expiredRecipients) {
      if (recipient.otpExpiresAt == null) continue;
      if (!recipient.otpCode) continue;
      await ctx.db.patch(recipient._id, {
        otpCode: undefined,
        otpExpiresAt: undefined,
      });
      cleaned++;
    }

    return { cleaned };
  },
});
