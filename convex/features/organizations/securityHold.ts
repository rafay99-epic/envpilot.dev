import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { requireAuthedUser, getAuthedUser } from "../../lib/identity";
import {
  assertOrgAction,
  assertCanManageUserAsync,
  normalizeOrgRole,
} from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { revokeAllSessionsForMember } from "./memberSessions";

/**
 * Security hold — freeze a member's access org-wide WITHOUT removing them.
 *
 * For incident response ("their laptop leaked"): the membership, role,
 * project assignments, and grants all stay intact; every authz decision is
 * denied at the choke points in convex/lib/authz.ts, all device sessions
 * are killed, and revocation events make the extension delete its synced
 * .env files. `reinstateMemberAccess` restores the exact prior shape.
 *
 * Pro-gated (`security_hold`). Hierarchy-gated like removal: you can only
 * suspend someone strictly below your own role; owners can't be suspended.
 */

export const suspendMemberAccess = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    alreadySuspended: v.boolean(),
    revokedCliTokens: v.number(),
    revokedExtensionSessions: v.number(),
    // WorkOS session ids for the calling Next.js route to revoke server-side.
    sessionIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Same capability set as removal — suspension is removal-grade severity.
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:remove_member"
    );

    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "security_hold"
    );
    if (!gate.allowed) {
      throw new Error(
        "Security hold is a Pro feature. Upgrade your organization to suspend member access."
      );
    }

    if (actor._id === args.targetUserId) {
      throw new Error("You cannot suspend your own access.");
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    if (normalizeOrgRole(membership.role) === "owner") {
      throw new Error(
        "Owners cannot be suspended. Transfer ownership first if this is an incident."
      );
    }

    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      membership.role,
      "suspend member"
    );

    if (membership.status === "suspended") {
      return {
        alreadySuspended: true,
        revokedCliTokens: 0,
        revokedExtensionSessions: 0,
        sessionIds: [],
      };
    }

    const now = Date.now();

    // Deny is live from this patch (authz choke points read status per
    // request); everything after is cleanup of residue on devices.
    await ctx.db.patch(membership._id, {
      status: "suspended",
      suspendedAt: now,
      suspendedBy: actor._id,
      suspendReason: args.reason,
    });

    const { revokedCliTokens, revokedExtensionSessions, sessionIds } =
      await revokeAllSessionsForMember(
        ctx,
        args.organizationId,
        args.targetUserId,
        actor._id,
        "Access suspended by administrator (security hold)"
      );

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "org.member_suspended",
      details: JSON.stringify({
        targetUserId: args.targetUserId,
        reason: args.reason,
        revokedCliTokens,
        revokedExtensionSessions,
      }),
      createdAt: now,
    });

    return {
      alreadySuspended: false,
      revokedCliTokens,
      revokedExtensionSessions,
      sessionIds,
    };
  },
});

export const reinstateMemberAccess = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
  },
  returns: v.object({ reinstated: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:remove_member"
    );

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      membership.role,
      "reinstate member"
    );

    if (membership.status !== "suspended") {
      return { reinstated: false };
    }

    // Sessions were revoked at suspension — the user signs in fresh and the
    // extension re-links on next use. Role/assignments/grants were never
    // touched, so nothing else needs rebuilding.
    await ctx.db.patch(membership._id, {
      status: "active",
      suspendedAt: undefined,
      suspendedBy: undefined,
      suspendReason: undefined,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "org.member_reinstated",
      details: JSON.stringify({ targetUserId: args.targetUserId }),
      createdAt: Date.now(),
    });

    return { reinstated: true };
  },
});

/**
 * The caller's own membership status for an org — powers the web hold
 * screen. Deliberately assertion-free: a suspended member must be able to
 * learn they're suspended (they get status + date, never who/why).
 */
export const getMyMembershipStatus = query({
  args: { organizationId: v.id("organizations") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("active"), v.literal("suspended")),
      suspendedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    // Mounted on every dashboard page (AccessNotices) — it races the JWT
    // being attached to the Convex client on load. No identity yet is a
    // normal transient state, not an error: return null, never throw.
    const actor = await getAuthedUser(ctx);
    if (!actor) return null;
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!membership) return null;
    const suspended = membership.status === "suspended";
    return {
      status: suspended ? ("suspended" as const) : ("active" as const),
      suspendedAt: suspended ? membership.suspendedAt : undefined,
    };
  },
});

/**
 * Credential sweep for the suspend dialog: org credentials the target
 * CREATED (API keys + CI/CD service tokens) that are still active. These
 * may live on the compromised machine — surfaced for opt-in revocation via
 * the existing apiKeys/serviceTokens revoke mutations, never auto-revoked
 * (they may power shared CI).
 */
export const listMemberCredentials = query({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      type: v.union(v.literal("api_key"), v.literal("service_token")),
      name: v.string(),
      createdAt: v.number(),
      lastUsedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:view_sessions"
    );

    // Hierarchy: this feeds a "revoke these credentials" dialog, so a
    // project_manager must not be able to enumerate an owner's (or a peer's)
    // API keys / service tokens.
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
    await assertCanManageUserAsync(
      ctx,
      callerMembership.role,
      targetMembership.role,
      "view credentials"
    );

    const now = Date.now();

    // Bounded: both tables retain revoked rows forever. 1000 org-wide
    // credentials is far beyond any real org; the dialog only needs the
    // caller's created-and-active subset.
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(1000);

    const serviceTokens = await ctx.db
      .query("serviceTokens")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(1000);

    const active = [
      ...apiKeys
        .filter(
          (k) =>
            k.createdBy === args.targetUserId &&
            !k.revokedAt &&
            (!k.expiresAt || k.expiresAt > now)
        )
        .map((k) => ({
          id: k._id as string,
          type: "api_key" as const,
          name: k.name,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
      ...serviceTokens
        .filter((t) => t.createdBy === args.targetUserId && !t.revokedAt)
        .map((t) => ({
          id: t._id as string,
          type: "service_token" as const,
          name: t.name,
          createdAt: t.createdAt,
          lastUsedAt: t.lastUsedAt,
        })),
    ];

    return active;
  },
});
