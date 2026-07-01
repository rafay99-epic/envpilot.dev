import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimits";
import { isCronPaused } from "./tierLimits";
import { batchGetUsers, userInfo } from "./helpers";

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

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    const userMap = await batchGetUsers(
      ctx,
      tokens.map((t) => t.userId)
    );

    return tokens.map((token) => ({
      ...token,
      accessToken: token.accessToken.slice(0, 8) + "...",
      user: userInfo(userMap.get(token.userId.toString())),
    }));
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    // Batch fetch projects
    const projIds = [...new Set(tokens.map((t) => t.projectId.toString()))];
    const projects = await Promise.all(
      projIds.map((id) => ctx.db.get(id as Id<"projects">))
    );
    const projMap = new Map(
      projects.filter(Boolean).map((p) => [p!._id.toString(), p!])
    );

    // Batch fetch orgs from projects
    const orgIds = [
      ...new Set(
        projects.filter(Boolean).map((p) => p!.organizationId.toString())
      ),
    ];
    const orgs = await Promise.all(
      orgIds.map((id) => ctx.db.get(id as Id<"organizations">))
    );
    const orgMap = new Map(
      orgs.filter(Boolean).map((o) => [o!._id.toString(), o!])
    );

    return tokens.map((token) => {
      const project = projMap.get(token.projectId.toString());
      const org = project
        ? orgMap.get(project.organizationId.toString())
        : undefined;
      return {
        ...token,
        accessToken: token.accessToken.slice(0, 8) + "...",
        project: project
          ? { _id: project._id, name: project.name, slug: project.slug }
          : null,
        organization: org
          ? { _id: org._id, name: org.name, slug: org.slug }
          : null,
      };
    });
  },
});

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

export const getByProjectAndUser = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .collect();

    return records.find((doc) => doc.isActive === true) ?? null;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    deviceId: v.optional(v.string()),
    deviceName: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 30;
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
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
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.userId,
      action: "access.token_created",
      details: JSON.stringify({
        deviceName: args.deviceName,
        expiresAt,
      }),
      createdAt: now,
    });

    return { accessId, accessToken, expiresAt };
  },
});

export const revoke = mutation({
  args: {
    accessId: v.id("projectAccess"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const access = await ctx.db.get(args.accessId);
    if (!access) {
      throw new Error("Access token not found");
    }

    const project = await ctx.db.get(access.projectId);

    await ctx.db.patch(args.accessId, {
      isActive: false,
    });

    // Create a revocation event for real-time sync
    await ctx.db.insert("permissionRevocationEvents", {
      accessToken: access.accessToken,
      projectId: access.projectId,
      userId: access.userId,
      reason: "Access token revoked by administrator",
      revokedBy: args.revokedBy,
      revokedAt: now,
      acknowledged: false,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours TTL
    });

    if (project) {
      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: access.projectId,
        userId: args.revokedBy,
        action: "access.token_revoked",
        details: JSON.stringify({
          deviceName: access.deviceName,
          revokedUserId: access.userId,
        }),
        createdAt: now,
      });
    }

    return args.accessId;
  },
});

export const revokeAllForUser = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);

    const tokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    for (const token of tokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
      });

      // Create a revocation event for real-time sync
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: args.userId,
        reason: "All access tokens revoked for user",
        revokedBy: args.revokedBy,
        revokedAt: now,
        acknowledged: false,
        expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours TTL
      });
    }

    if (project) {
      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: args.revokedBy,
        action: "access.token_revoked",
        details: JSON.stringify({
          bulkRevoke: true,
          revokedUserId: args.userId,
          count: tokens.length,
        }),
        createdAt: now,
      });
    }

    return { revokedCount: tokens.length };
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
      .collect()
      .then((rows) =>
        rows.filter((doc) => doc.isActive === true && doc.expiresAt < now)
      );

    for (const token of expiredTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
      });
    }

    return { cleanedUp: expiredTokens.length };
  },
});
