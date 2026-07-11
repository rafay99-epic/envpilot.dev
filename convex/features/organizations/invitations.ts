import { v } from "convex/values";
import { mutation, query, internalMutation } from "../../_generated/server";
import {
  checkNumericLimit,
  countMembersAndPendingInvites,
} from "../featureRegistry/gates";
import { rateLimiter } from "../../lib/rateLimits";
import { isCronPaused } from "../billing/tierLimits";
import { batchGetUsers } from "../../lib/users";
import {
  assertOrgAction,
  assertOrgMembership,
  assertCanAssignRole,
  normalizeOrgRole,
} from "../../lib/authz";
import { requireAuthedUser, getAuthedUser } from "../../lib/identity";
import { voidTombstones } from "./tombstones";

/**
 * Invitation Queries and Mutations
 */

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const listPendingByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Authorization: only members of the org may list its pending invitations.
    const actor = await requireAuthedUser(ctx);
    await assertOrgMembership(ctx, actor._id, args.organizationId);

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.status === "pending"));

    const now = Date.now();
    const validInvitations = invitations.filter((inv) => inv.expiresAt > now);

    const userMap = await batchGetUsers(
      ctx,
      validInvitations.map((inv) => inv.invitedBy)
    );

    return validInvitations.map((inv) => {
      // Never expose the invitation token to org listings — it grants
      // acceptance and must only travel via the emailed accept link.
      const { token: _token, ...safe } = inv;
      const inviter = userMap.get(inv.invitedBy.toString());
      return {
        ...safe,
        invitedByUser: inviter
          ? { name: inviter.name, email: inviter.email }
          : null,
      };
    });
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
      v.literal("owner"),
      v.literal("project_manager"),
      v.literal("team_lead"),
      v.literal("developer")
    ),
    projectIds: v.optional(v.array(v.id("projects"))),
    // Environment scope applied to the created project assignments on
    // acceptance — only applied when the invited role is developer
    // (owners/PMs/team leads are always unrestricted). Omit for all
    // environments.
    environments: v.optional(v.array(v.string())),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners, project managers, and team leads can invite
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:invite_member"
    );

    // Hierarchy: can only invite roles below your own (owners may invite any)
    assertCanAssignRole(callerMembership.role, args.role);

    if (args.environments && args.environments.length === 0) {
      throw new Error(
        "Environment scope cannot be empty — omit it to allow all environments"
      );
    }

    // Rate limit: prevent invitation spam
    await rateLimiter.limit(ctx, "invitationCreate", {
      key: args.organizationId,
      throws: true,
    });

    const now = Date.now();

    // Validate expiration days
    const expiresInDays = args.expiresInDays ?? 7;
    if (expiresInDays < 1 || expiresInDays > 30) {
      throw new Error("Invitation expiration must be between 1 and 30 days");
    }
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    // Check tier limits for team member invitations
    const totalMembers = await countMembersAndPendingInvites(
      ctx.db,
      args.organizationId
    );
    const memberCheck = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "max_team_members",
      totalMembers
    );
    if (!memberCheck.allowed) {
      throw new Error(memberCheck.reason!);
    }

    // Check pending invitation limit separately
    const pendingInvites = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) =>
        rows.filter((doc) => doc.status === "pending" && doc.expiresAt > now)
      );
    const inviteCheck = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "max_invitations",
      pendingInvites.length
    );
    if (!inviteCheck.allowed) {
      throw new Error(inviteCheck.reason!);
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      const existingMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("userId", existingUser._id)
        )
        .first();

      if (existingMembership) {
        throw new Error("User is already a member");
      }
    }

    const existingInvitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect()
      .then(
        (rows) =>
          rows.find(
            (doc) =>
              doc.status === "pending" &&
              doc.organizationId === args.organizationId
          ) ?? null
      );

    if (existingInvitation && existingInvitation.expiresAt > now) {
      throw new Error("An invitation is already pending");
    }

    const token = generateToken();

    const invitationId = await ctx.db.insert("invitations", {
      email: args.email,
      organizationId: args.organizationId,
      role: args.role,
      projectIds: args.projectIds,
      environments: args.environments,
      token,
      invitedBy: actor._id,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "invitation.sent",
      details: JSON.stringify({
        email: args.email,
        role: args.role,
        environments: args.environments ?? "all",
      }),
      createdAt: now,
    });

    return { invitationId, token };
  },
});

export const accept = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
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

    // The accepting user's email must match the invited email — an invitation
    // is addressed to a specific person, not a bearer token.
    const acceptingUser = actor;
    if (
      (acceptingUser.email ?? "").toLowerCase() !==
      invitation.email.toLowerCase()
    ) {
      throw new Error("This invitation was sent to a different email address.");
    }

    const existingMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", invitation.organizationId)
          .eq("userId", actor._id)
      )
      .first();

    if (existingMembership) {
      throw new Error("Already a member");
    }

    const invitedRole = normalizeOrgRole(invitation.role);

    await ctx.db.insert("organizationMembers", {
      organizationId: invitation.organizationId,
      userId: actor._id,
      role: invitedRole,
      joinedAt: now,
      invitedBy: invitation.invitedBy,
    });

    // Re-joining voids any "your access was revoked" exit notice for this org.
    await voidTombstones(ctx, invitation.organizationId, actor._id);

    // Create project assignments if projects were specified in the invitation.
    // Owners have implicit access to every project, so no assignments needed.
    if (
      invitation.projectIds &&
      invitation.projectIds.length > 0 &&
      invitedRole !== "owner"
    ) {
      // Environment scope only constrains developers — owners, PMs, and team
      // leads are always unrestricted, so a scope on the invitation is ignored
      const environmentScope =
        invitedRole === "developer" ? invitation.environments : undefined;

      for (const projectId of invitation.projectIds) {
        const project = await ctx.db.get(projectId);
        if (project && !project.deletedAt) {
          // Pure scope assignment — capabilities come from the org role
          await ctx.db.insert("projectMembers", {
            projectId,
            userId: actor._id,
            ...(environmentScope ? { environments: environmentScope } : {}),
            addedBy: invitation.invitedBy,
            addedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      respondedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: invitation.organizationId,
      userId: actor._id,
      action: "invitation.accepted",
      details: JSON.stringify({
        invitationId: invitation._id,
        role: invitedRole,
        projectIds: invitation.projectIds,
        environments:
          invitedRole === "developer"
            ? (invitation.environments ?? "all")
            : "all",
      }),
      createdAt: now,
    });

    return invitation.organizationId;
  },
});

export const decline = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Declining is anonymous-capable: an invitee may decline from the email
    // link without ever signing in. Derive the actor only if a verified
    // identity is present; otherwise keep the anonymous path (no audit row).
    const actor = await getAuthedUser(ctx);
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

    if (actor) {
      await ctx.db.insert("auditLogs", {
        organizationId: invitation.organizationId,
        userId: actor._id,
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
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    // Authorization: only admins and team_leads can cancel invitations
    await assertOrgAction(
      ctx,
      actor._id,
      invitation.organizationId,
      "org:invite_member"
    );

    if (invitation.status !== "pending") {
      throw new Error("Can only cancel pending invitations");
    }

    await ctx.db.delete(args.invitationId);

    await ctx.db.insert("auditLogs", {
      organizationId: invitation.organizationId,
      userId: actor._id,
      action: "invitation.canceled",
      details: JSON.stringify({
        invitationId: args.invitationId,
        email: invitation.email,
        role: invitation.role,
      }),
      createdAt: Date.now(),
    });

    return args.invitationId;
  },
});

export const resend = mutation({
  args: {
    invitationId: v.id("invitations"),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    // Authorization: owners, project managers, and team leads can resend
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      invitation.organizationId,
      "org:invite_member"
    );

    // Hierarchy: cannot re-arm an invitation for a role at or above your own
    // (e.g. a team_lead must not resend an owner/PM invitation).
    assertCanAssignRole(callerMembership.role, invitation.role);

    const now = Date.now();
    const expiresInDays = args.expiresInDays ?? 7;
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    if (invitation.status !== "pending") {
      throw new Error("Can only resend pending invitations");
    }

    const newToken = generateToken();

    await ctx.db.patch(args.invitationId, {
      token: newToken,
      expiresAt,
      invitedBy: actor._id,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: invitation.organizationId,
      userId: actor._id,
      action: "invitation.resent",
      details: JSON.stringify({
        invitationId: args.invitationId,
        email: invitation.email,
        role: invitation.role,
        expiresAt,
      }),
      createdAt: now,
    });

    return { invitationId: args.invitationId, token: newToken };
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_invitations")) return;

    const now = Date.now();

    // Compound index range reads only actually-expired pending invites,
    // instead of collecting every pending invite platform-wide each run
    const expiredInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "pending").lt("expiresAt", now)
      )
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
