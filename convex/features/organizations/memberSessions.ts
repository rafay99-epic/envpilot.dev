import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertOrgAction, assertCanManageUserAsync } from "../../lib/authz";

/**
 * Deactivate every active device session (CLI tokens + extension project
 * links) a member holds in an org, emitting the revocation events that make
 * the extension unlink and delete its synced .env files. Shared by
 * `revokeAllMemberSessions` (admin action) and the security-hold suspend
 * path (securityHold.ts). Returns the WorkOS session ids the CALLING
 * Next.js route must revoke server-side — Convex cannot call WorkOS.
 */
export async function revokeAllSessionsForMember(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  targetUserId: Id<"users">,
  actorId: Id<"users">,
  reason: string
): Promise<{
  revokedCliTokens: number;
  revokedExtensionSessions: number;
  sessionIds: string[];
}> {
  const now = Date.now();
  const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

  let revokedCliCount = 0;
  let revokedExtensionCount = 0;
  const sessionIds: string[] = [];

  // Revoke active CLI/extension device-sessions (cliTokens backs both).
  // Tokens carrying a DIFFERENT organizationId are skipped; org-matching and
  // legacy (unset) tokens are revoked.
  const activeCliTokens = await ctx.db
    .query("cliTokens")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", targetUserId).eq("isActive", true)
    )
    .collect();

  for (const token of activeCliTokens) {
    if (token.organizationId && token.organizationId !== organizationId) {
      continue;
    }
    await ctx.db.patch(token._id, { isActive: false, revokedAt: now });
    if (token.sessionId) sessionIds.push(token.sessionId);
    revokedCliCount++;
  }

  // Revoke all active extension sessions across org projects.
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect()
    .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

  for (const project of projects) {
    const activeTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", project._id).eq("userId", targetUserId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    for (const token of activeTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: project._id,
        userId: targetUserId,
        reason,
        revokedBy: actorId,
        revokedAt: now,
        acknowledged: false,
        expiresAt: revocationExpiresAt,
      });
      revokedExtensionCount++;
    }
  }

  return {
    revokedCliTokens: revokedCliCount,
    revokedExtensionSessions: revokedExtensionCount,
    sessionIds,
  };
}

// ==========================================
// SESSION MANAGEMENT
// ==========================================

/**
 * Get all active sessions (CLI tokens + extension links) for a member.
 * Only admins and team leads can view another member's sessions.
 */
export const getMemberSessions = query({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: only roles allowed to view sessions (owner, project_manager)
    await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:view_sessions"
    );

    // Verify target is a member of this org
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this organization");
    }

    // Get active CLI device-sessions. cliTokens now backs both surfaces; the
    // extension is shown via projectAccess below, so exclude clientType
    // "extension" here (legacy rows with no clientType are treated as CLI).
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.targetUserId).eq("isActive", true)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.clientType !== "extension"));

    const maskedCliTokens = cliTokens.map((token) => ({
      _id: token._id,
      deviceName: token.deviceName || "Unknown device",
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      // Device-flow rows store no token server-side; fall back to a generic tag.
      tokenPreview: token.accessToken
        ? token.accessToken.slice(0, 8) + "..."
        : "device",
    }));

    // Get active extension sessions across all org projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    const extensionSessions = [];
    for (const project of projects) {
      const accessRecords = await ctx.db
        .query("projectAccess")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", args.targetUserId)
        )
        .collect()
        .then((rows) => rows.filter((doc) => doc.isActive === true));

      for (const access of accessRecords) {
        extensionSessions.push({
          _id: access._id,
          projectId: project._id,
          projectName: project.name,
          deviceName: access.deviceName || "Unknown device",
          lastUsedAt: access.lastUsedAt,
          createdAt: access.createdAt,
          expiresAt: access.expiresAt,
          tokenPreview: access.accessToken.slice(0, 8) + "...",
        });
      }
    }

    return { cliTokens: maskedCliTokens, extensionSessions };
  },
});

/**
 * Revoke a specific CLI token for a member.
 */
export const revokeMemberCliToken = mutation({
  args: {
    organizationId: v.id("organizations"),
    tokenId: v.id("cliTokens"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners and project managers can revoke sessions
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:revoke_session"
    );

    const now = Date.now();

    const token = await ctx.db.get(args.tokenId);
    if (!token || !token.isActive) {
      throw new Error("Token not found or already revoked");
    }

    // When a token carries an organizationId (newer tokens), reject one that
    // belongs to a different org outright. Legacy tokens leave it unset and
    // fall back to the membership check below.
    if (token.organizationId && token.organizationId !== args.organizationId) {
      throw new Error("Token does not belong to this organization");
    }

    // cliTokens created before organizationId existed are not org-scoped — a
    // token ID from another org could be passed here. Verify the token's owner
    // is a member of THIS org, which both rejects cross-org token IDs and gives
    // us the target's role for the hierarchy check below.
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", token.userId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("Token does not belong to a member of this organization");
    }

    // Hierarchy: cannot revoke sessions of someone at or above your own level
    // (e.g. a project_manager must not revoke an owner's session).
    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      targetMembership.role,
      "revoke session"
    );

    await ctx.db.patch(args.tokenId, { isActive: false, revokedAt: now });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "access.token_revoked",
      details: JSON.stringify({
        tokenId: args.tokenId,
        targetUserId: token.userId,
        deviceName: token.deviceName,
        type: "cli",
      }),
      createdAt: now,
    });

    // The caller (Next.js route with the WorkOS SDK) revokes this WorkOS
    // session server-side so remote sign-out is real.
    return { success: true, sessionId: token.sessionId };
  },
});

/**
 * Revoke a specific extension session (project access) for a member.
 */
export const revokeMemberExtensionSession = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectAccessId: v.id("projectAccess"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners and project managers can revoke sessions
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:revoke_session"
    );

    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const access = await ctx.db.get(args.projectAccessId);
    if (!access || !access.isActive) {
      throw new Error("Extension session not found or already revoked");
    }

    // Verify the project belongs to this org
    const project = await ctx.db.get(access.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project does not belong to this organization");
    }

    // Hierarchy: cannot revoke sessions of someone at or above your own level
    // (e.g. a project_manager must not revoke an owner's session).
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", access.userId)
      )
      .first();

    if (!targetMembership) {
      throw new Error(
        "Session does not belong to a member of this organization"
      );
    }

    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      targetMembership.role,
      "revoke session"
    );

    await ctx.db.patch(args.projectAccessId, { isActive: false });

    // Create revocation event for real-time extension sync
    await ctx.db.insert("permissionRevocationEvents", {
      accessToken: access.accessToken,
      projectId: access.projectId,
      userId: access.userId,
      reason: "Session revoked by administrator",
      revokedBy: actor._id,
      revokedAt: now,
      acknowledged: false,
      expiresAt: revocationExpiresAt,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "access.extension_unlinked",
      details: JSON.stringify({
        projectAccessId: args.projectAccessId,
        targetUserId: access.userId,
        projectId: access.projectId,
        deviceName: access.deviceName,
        type: "extension",
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Revoke ALL active sessions (CLI + extension) for a member
 * without removing them from the organization.
 */
export const revokeAllMemberSessions = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners and project managers can revoke sessions
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:revoke_session"
    );

    const now = Date.now();

    // Verify target is a member
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this organization");
    }

    // Hierarchy: cannot revoke sessions of someone at or above your own level
    // (e.g. a project_manager must not revoke an owner's sessions).
    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      targetMembership.role,
      "revoke session"
    );

    const {
      revokedCliTokens: revokedCliCount,
      revokedExtensionSessions: revokedExtensionCount,
      sessionIds,
    } = await revokeAllSessionsForMember(
      ctx,
      args.organizationId,
      args.targetUserId,
      actor._id,
      "All sessions revoked by administrator"
    );

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "access.token_revoked",
      details: JSON.stringify({
        targetUserId: args.targetUserId,
        revokedCliTokens: revokedCliCount,
        revokedExtensionSessions: revokedExtensionCount,
        type: "all",
      }),
      createdAt: now,
    });

    return {
      success: true,
      revokedCliTokens: revokedCliCount,
      revokedExtensionSessions: revokedExtensionCount,
      sessionIds,
    };
  },
});
