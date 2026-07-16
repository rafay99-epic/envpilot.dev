import { v } from "convex/values";
import { mutation, query, internalMutation } from "../../_generated/server";
import { rateLimiter } from "../../lib/rateLimits";
import { isCronPaused } from "../billing/tierLimits";
import { assertOrgAction, isSuspendedMembership } from "../../lib/authz";
import { requireAuthedUser } from "../../lib/identity";

/**
 * Project Access Queries and Mutations (for extension linking)
 *
 * Since the Stage 2 device-flow cutover a projectAccess row is a SCOPING record
 * only — it records which project a linked extension device is focused on, and
 * its `accessToken` is an internal handle used to key real-time revocation
 * events. Identity is the WorkOS JWT (requireAuthedUser); the token is never an
 * auth credential a client presents to prove who it is.
 */
const REVOCATION_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a project-access token using a CSPRNG. It keys revocation events and
 * must be unguessable — crypto.getRandomValues(), never Math.random().
 */
function generateAccessToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let token = "env_";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(bytes[i] % chars.length);
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

    if (!membership || isSuspendedMembership(membership)) {
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
 * List the caller's own active project-access (extension-link) scoping records.
 * Identity-scoped replacement for the old getByAccessToken token lookup: the
 * VS Code extension attaches its WorkOS JWT (requireAuthedUser) and gets the
 * projects it is linked to for its WebSocket subscriptions — no token string
 * is presented as a credential.
 */
export const listForCaller = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projectAccess"),
      projectId: v.id("projects"),
      deviceId: v.optional(v.string()),
      deviceName: v.optional(v.string()),
      expiresAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const rows = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    return rows
      .filter((row) => row.isActive && row.expiresAt >= now)
      .map((row) => ({
        _id: row._id,
        projectId: row.projectId,
        deviceId: row.deviceId,
        deviceName: row.deviceName,
        expiresAt: row.expiresAt,
      }));
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

    if (!membership || isSuspendedMembership(membership)) {
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

    if (!membership || isSuspendedMembership(membership)) {
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

/**
 * Link a VS Code extension device to a project. Identity is the WorkOS JWT
 * (requireAuthedUser) — the caller can no longer supply an arbitrary userId or
 * present a bearer token as a credential. Mints a projectAccess scoping record
 * whose accessToken keys real-time revocation events.
 */
export const linkExtension = mutation({
  args: {
    projectId: v.id("projects"),
    deviceId: v.string(),
    deviceName: v.string(),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Rate limit: prevent excessive extension linking
    await rateLimiter.limit(ctx, "extensionLink", {
      key: actor._id,
      throws: true,
    });

    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 30;
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorize BEFORE minting a token: the acting user must be permitted to
    // link an extension in this project's org. Without this, any authenticated
    // bearer holder could mint a project-access token (itself an identity
    // credential) for an arbitrary project. Mirrors unlinkExtension.
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:link_extension"
    );

    const existingAccess = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", actor._id)
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
        userId: actor._id,
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
      userId: actor._id,
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
      userId: actor._id,
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

/**
 * Self-service unlink — identity is the WorkOS JWT (requireAuthedUser) and the
 * token lookup is scoped to (projectId, actor._id), so a caller can only ever
 * unlink a link that belongs to THEM. The caller must still be an org member
 * permitted to link/unlink their own extension in the project's org.
 */
export const unlinkExtension = mutation({
  args: {
    projectId: v.id("projects"),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);

    if (project && !project.deletedAt) {
      await assertOrgAction(
        ctx,
        actor._id,
        project.organizationId,
        "org:link_extension"
      );
    }

    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", actor._id)
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
      userId: actor._id,
      reason: "Extension unlinked",
      revokedBy: actor._id,
      revokedAt: now,
      acknowledged: false,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours TTL
    });

    if (project) {
      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: actor._id,
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

/**
 * Batched unsync activity report from the VS Code extension. Purges happen at
 * editor shutdown where network calls are unreliable, so the extension stores
 * a local summary and reports it on the NEXT activation — one call, counts
 * only (never file paths or values). Best-effort by contract: the extension
 * fires and forgets; unknown/deleted projects are skipped, not errors.
 */
export const reportUnsync = mutation({
  args: {
    reports: v.array(
      v.object({
        projectId: v.id("projects"),
        deletedCount: v.number(),
        sparedCount: v.number(),
        trigger: v.union(v.literal("close"), v.literal("crash-sweep")),
        occurredAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    // Cap defensively: a legitimate report covers a handful of projects.
    const reports = args.reports.slice(0, 50);

    let logged = 0;
    for (const report of reports) {
      const project = await ctx.db.get(report.projectId);
      if (!project) continue;

      // Only org members may write audit rows into an org — a stale link on
      // a device whose membership ended is skipped, not an error.
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", project.organizationId).eq("userId", actor._id)
        )
        .first();
      if (!membership) continue;

      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: report.projectId,
        userId: actor._id,
        action: "access.extension_unsync",
        details: JSON.stringify({
          deletedCount: report.deletedCount,
          sparedCount: report.sparedCount,
          trigger: report.trigger,
          occurredAt: report.occurredAt,
        }),
        createdAt: now,
      });
      logged++;
    }

    return { logged };
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
