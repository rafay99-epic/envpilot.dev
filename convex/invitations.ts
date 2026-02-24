import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getTierLimits } from "./tierLimits";

/**
 * Invitation Queries and Mutations
 */

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const listPendingByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const now = Date.now();
    const validInvitations = invitations.filter((inv) => inv.expiresAt > now);

    const invitationsWithInviter = await Promise.all(
      validInvitations.map(async (inv) => {
        const inviter = await ctx.db.get(inv.invitedBy);
        return {
          ...inv,
          invitedByUser: inviter
            ? { name: inviter.name, email: inviter.email }
            : null,
        };
      })
    );

    return invitationsWithInviter;
  },
});

export const getForEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const now = Date.now();
    const validInvitations = invitations.filter((inv) => inv.expiresAt > now);

    const invitationsWithOrg = await Promise.all(
      validInvitations.map(async (inv) => {
        const org = await ctx.db.get(inv.organizationId);
        const inviter = await ctx.db.get(inv.invitedBy);
        return {
          ...inv,
          organization: org
            ? { name: org.name, slug: org.slug, logoUrl: org.logoUrl }
            : null,
          invitedByUser: inviter
            ? { name: inviter.name, email: inviter.email }
            : null,
        };
      })
    );

    return invitationsWithOrg;
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) return null;

    const org = await ctx.db.get(invitation.organizationId);
    const inviter = await ctx.db.get(invitation.invitedBy);

    return {
      ...invitation,
      organization: org
        ? { name: org.name, slug: org.slug, logoUrl: org.logoUrl }
        : null,
      invitedByUser: inviter
        ? { name: inviter.name, email: inviter.email }
        : null,
    };
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("admin"),
      v.literal("team_lead"),
      v.literal("member")
    ),
    invitedBy: v.id("users"),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate expiration days
    const expiresInDays = args.expiresInDays ?? 7;
    if (expiresInDays < 1 || expiresInDays > 30) {
      throw new Error("Invitation expiration must be between 1 and 30 days");
    }
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    // Check tier limits for team member invitations
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const limits = getTierLimits(org.tier);
    if (limits.maxTeamMembers !== null) {
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();

      const pendingInvitations = await ctx.db
        .query("invitations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();

      const validPendingInvitations = pendingInvitations.filter(
        (inv) => inv.expiresAt > now
      );

      const totalMembers = members.length + validPendingInvitations.length;

      if (totalMembers >= limits.maxTeamMembers) {
        throw new Error(
          `Team member limit reached (${totalMembers}/${limits.maxTeamMembers}). Upgrade to Pro for unlimited team members.`
        );
      }
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      const existingMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", existingUser._id)
        )
        .first();

      if (existingMembership) {
        throw new Error("User is already a member");
      }
    }

    const existingInvitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("organizationId"), args.organizationId)
        )
      )
      .first();

    if (existingInvitation && existingInvitation.expiresAt > now) {
      throw new Error("An invitation is already pending");
    }

    const token = generateToken();

    const invitationId = await ctx.db.insert("invitations", {
      email: args.email,
      organizationId: args.organizationId,
      role: args.role,
      token,
      invitedBy: args.invitedBy,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.invitedBy,
      action: "invitation.sent",
      details: JSON.stringify({
        email: args.email,
        role: args.role,
      }),
      createdAt: now,
    });

    return { invitationId, token };
  },
});

export const accept = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error(`Invitation has already been ${invitation.status}`);
    }

    if (invitation.expiresAt < now) {
      await ctx.db.patch(invitation._id, {
        status: "expired",
        respondedAt: now,
      });
      throw new Error("Invitation has expired");
    }

    const existingMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("userId", args.userId)
      )
      .first();

    if (existingMembership) {
      throw new Error("Already a member");
    }

    await ctx.db.insert("organizationMembers", {
      organizationId: invitation.organizationId,
      userId: args.userId,
      role: invitation.role,
      joinedAt: now,
      invitedBy: invitation.invitedBy,
    });

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      respondedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: invitation.organizationId,
      userId: args.userId,
      action: "invitation.accepted",
      details: JSON.stringify({
        invitationId: invitation._id,
        role: invitation.role,
      }),
      createdAt: now,
    });

    return invitation.organizationId;
  },
});

export const decline = mutation({
  args: {
    token: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error(`Invitation has already been ${invitation.status}`);
    }

    await ctx.db.patch(invitation._id, {
      status: "declined",
      respondedAt: now,
    });

    if (args.userId) {
      await ctx.db.insert("auditLogs", {
        organizationId: invitation.organizationId,
        userId: args.userId,
        action: "invitation.declined",
        details: JSON.stringify({
          invitationId: invitation._id,
        }),
        createdAt: now,
      });
    }

    return invitation._id;
  },
});

export const cancel = mutation({
  args: {
    invitationId: v.id("invitations"),
    cancelledBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error("Can only cancel pending invitations");
    }

    await ctx.db.delete(args.invitationId);

    return args.invitationId;
  },
});

export const resend = mutation({
  args: {
    invitationId: v.id("invitations"),
    resentBy: v.id("users"),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 7;
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error("Can only resend pending invitations");
    }

    const newToken = generateToken();

    await ctx.db.patch(args.invitationId, {
      token: newToken,
      expiresAt,
      invitedBy: args.resentBy,
    });

    return { invitationId: args.invitationId, token: newToken };
  },
});

export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const invitation of expiredInvitations) {
      await ctx.db.patch(invitation._id, {
        status: "expired",
        respondedAt: now,
      });

      await ctx.db.insert("auditLogs", {
        organizationId: invitation.organizationId,
        userId: invitation.invitedBy,
        action: "invitation.expired",
        details: JSON.stringify({
          email: invitation.email,
        }),
        createdAt: now,
      });
    }

    return { expiredCount: expiredInvitations.length };
  },
});
