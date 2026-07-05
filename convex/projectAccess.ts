import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { rateLimiter } from "./rateLimits";
import { isCronPaused } from "./tierLimits";
import { assertOrgAction } from "./authz";

/**
 * Project Access Queries and Mutations (for extension linking)
 */
const REVOCATION_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function generateAccessToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "env_";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const validateToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!access) {
      return { valid: false, reason: "Token not found" };
    }

    if (!access.isActive) {
      return { valid: false, reason: "Token has been revoked" };
    }

    if (access.expiresAt < now) {
      return { valid: false, reason: "Token has expired" };
    }

    const project = await ctx.db.get(access.projectId);
    if (!project || project.deletedAt) {
      return { valid: false, reason: "Project not found" };
    }

    const user = await ctx.db.get(access.userId);
    if (!user) {
      return { valid: false, reason: "User not found" };
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", access.userId)
      )
      .first();

    if (!membership) {
      return {
        valid: false,
        reason: "Organization membership no longer active",
      };
    }

    return {
      valid: true,
      projectId: access.projectId,
      userId: access.userId,
      expiresAt: access.expiresAt,
    };
  },
});

/**
 * Resolve an access token to userId + projectId.
 * Used by the VS Code extension to get IDs for WebSocket subscriptions.
 * Returns null if token is invalid, inactive, or expired.
 */
export const getByAccessToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!access || !access.isActive) return null;
    if (access.expiresAt < Date.now()) return null;

    return {
      projectId: access.projectId,
      userId: access.userId,
      expiresAt: access.expiresAt,
    };
  },
});

/**
 * Resolve the owning user of an access token regardless of active/expired
 * state. Used by the extension acknowledge-revocation route to supply the
 * acknowledging user id — the token being acknowledged has usually just been
 * revoked, so getByAccessToken (which requires isActive) would return null.
 */
export const getOwnerByAccessToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!access) return null;

    return { userId: access.userId };
  },
});

export const updateLastUsed = mutation({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!access || !access.isActive) {
      return false;
    }

    const project = await ctx.db.get(access.projectId);
    if (!project || project.deletedAt) {
      await ctx.db.patch(access._id, { isActive: false });
      return false;
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", access.userId)
      )
      .first();

    if (!membership) {
      await ctx.db.patch(access._id, { isActive: false });

      const pendingRevocation = await ctx.db
        .query("permissionRevocationEvents")
        .withIndex("by_access_token", (q) =>
          q.eq("accessToken", access.accessToken)
        )
        .collect()
        .then((rows) => rows.find((doc) => doc.acknowledged === false) ?? null);

      if (!pendingRevocation) {
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: access.accessToken,
          projectId: access.projectId,
          userId: access.userId,
          reason: "Organization membership removed",
          revokedBy: access.userId,
          revokedAt: now,
          acknowledged: false,
          expiresAt: now + REVOCATION_EVENT_TTL_MS,
        });
      }

      return false;
    }

    await ctx.db.patch(access._id, {
      lastUsedAt: now,
    });

    return true;
  },
});

export const refresh = mutation({
  args: {
    accessToken: v.string(),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 30;
    const newExpiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!access) {
      throw new Error("Access token not found");
    }

    if (!access.isActive) {
      throw new Error("Access token has been revoked");
    }

    if (access.expiresAt < now) {
      throw new Error("Access token has expired");
    }

    const project = await ctx.db.get(access.projectId);
    if (!project || project.deletedAt) {
      await ctx.db.patch(access._id, { isActive: false });
      throw new Error("Project not found");
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", access.userId)
      )
      .first();

    if (!membership) {
      await ctx.db.patch(access._id, { isActive: false });

      const pendingRevocation = await ctx.db
        .query("permissionRevocationEvents")
        .withIndex("by_access_token", (q) =>
          q.eq("accessToken", access.accessToken)
        )
        .collect()
        .then((rows) => rows.find((doc) => doc.acknowledged === false) ?? null);

      if (!pendingRevocation) {
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: access.accessToken,
          projectId: access.projectId,
          userId: access.userId,
          reason: "Organization membership removed",
          revokedBy: access.userId,
          revokedAt: now,
          acknowledged: false,
          expiresAt: now + REVOCATION_EVENT_TTL_MS,
        });
      }

      throw new Error("Access token is no longer valid");
    }

    await ctx.db.patch(access._id, {
      expiresAt: newExpiresAt,
      lastUsedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: access.projectId,
      userId: access.userId,
      action: "access.token_refreshed",
      details: JSON.stringify({
        deviceName: access.deviceName,
        newExpiresAt,
      }),
      createdAt: now,
    });

    return { expiresAt: newExpiresAt };
  },
});

export const linkExtension = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    deviceId: v.string(),
    deviceName: v.string(),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Rate limit: prevent excessive extension linking
    await rateLimiter.limit(ctx, "extensionLink", {
      key: args.userId,
      throws: true,
    });

    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 30;
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    const existingAccess = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .collect()
      .then(
        (rows) =>
          rows.find(
            (doc) => doc.isActive === true && doc.deviceId === args.deviceId
          ) ?? null
      );

    if (existingAccess) {
      await ctx.db.patch(existingAccess._id, {
        expiresAt,
        deviceName: args.deviceName,
        lastUsedAt: now,
      });

      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: args.userId,
        action: "access.token_refreshed",
        details: JSON.stringify({
          relink: true,
          deviceId: args.deviceId,
          deviceName: args.deviceName,
          newExpiresAt: expiresAt,
        }),
        createdAt: now,
      });

      return {
        accessId: existingAccess._id,
        accessToken: existingAccess.accessToken,
      };
    }

    const accessToken = generateAccessToken();

    const accessId = await ctx.db.insert("projectAccess", {
      projectId: args.projectId,
      userId: args.userId,
      accessToken,
      expiresAt,
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      isActive: true,
      createdAt: now,
      lastUsedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.userId,
      action: "access.extension_linked",
      details: JSON.stringify({
        deviceId: args.deviceId,
        deviceName: args.deviceName,
      }),
      createdAt: now,
    });

    return { accessId, accessToken };
  },
});

export const unlinkExtension = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);

    // Authorization: this is a self-service unlink — `userId` is the acting
    // caller. The lookup is scoped to (projectId, userId), so a caller can only
    // ever unlink a token that belongs to THEM; a token owned by another user
    // is simply not found. The caller must still be an org member permitted to
    // link/unlink their own extension in the project's org.
    if (project && !project.deletedAt) {
      await assertOrgAction(
        ctx,
        args.userId,
        project.organizationId,
        "org:link_extension"
      );
    }

    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .collect()
      .then(
        (rows) =>
          rows.find(
            (doc) => doc.isActive === true && doc.deviceId === args.deviceId
          ) ?? null
      );

    if (!access) {
      throw new Error("Extension not linked");
    }

    await ctx.db.patch(access._id, {
      isActive: false,
    });

    // Create a revocation event for real-time sync
    await ctx.db.insert("permissionRevocationEvents", {
      accessToken: access.accessToken,
      projectId: args.projectId,
      userId: args.userId,
      reason: "Extension unlinked",
      revokedBy: args.userId,
      revokedAt: now,
      acknowledged: false,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours TTL
    });

    if (project) {
      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: args.userId,
        action: "access.extension_unlinked",
        details: JSON.stringify({
          deviceId: args.deviceId,
          deviceName: access.deviceName,
        }),
        createdAt: now,
      });
    }

    return access._id;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_project_access")) return;

    const now = Date.now();

    const expiredTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_active_and_expires", (q) =>
        q.eq("isActive", true).lt("expiresAt", now)
      )
      .collect();

    for (const token of expiredTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
      });
    }

    return { cleanedUp: expiredTokens.length };
  },
});
