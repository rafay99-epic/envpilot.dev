import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  sanitizeConvexError,
  handleApiError,
  reportApiError,
} from "@/lib/api-errors";
import { z } from "zod";

import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { createLogger } from "@/lib/logger";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { ORG_ROLE_LABELS } from "@/lib/roles";

const log = createLogger("api/organizations/members");

// Convex ID pattern - alphanumeric characters only
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "project_manager", "team_lead", "developer"]),
  // Project assignments only — project-level roles no longer exist.
  projectIds: z.array(z.string()).optional(),
  // Developer environment scope — omitted means unrestricted access.
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1, "Select at least one environment")
    .optional(),
});

const updateRoleSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  role: z.enum(["owner", "project_manager", "team_lead", "developer"]),
});

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/organizations/[slug]/members - List all members
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    // Ensure the `users` row exists so the session JWT resolves in the
    // authenticated Convex calls below.
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Check membership
    const membership = await authed.query(api.organizations.getMembership, {
      organizationId,
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    const members = await convex.query(api.organizations.getMembers, {
      organizationId,
    });

    // Also get pending invitations
    const invitations = await authed.query(
      api.invitations.listPendingByOrganization,
      {
        organizationId,
      }
    );

    return NextResponse.json({ members, invitations });
  } catch (error) {
    reportApiError(error, "GET /api/organizations/[slug]/members");
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations/[slug]/members - Invite a new member
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;

    const body = await request.json();
    const validation = inviteMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization is enforced in the Convex mutation (assertOrgAction + assertCanAssignRole)
    const { email, role, projectIds, environments } = validation.data;

    // Get organization details for the email
    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    console.log(
      "[INVITE] Creating invitation for:",
      email,
      "role:",
      role,
      "org:",
      organizationId
    );

    const result = await createAuthedConvexClient(accessToken!).mutation(
      api.invitations.create,
      {
        email,
        organizationId,
        role,
        projectIds: projectIds as Id<"projects">[] | undefined,
        // Developer environment scope — omitted means unrestricted.
        ...(environments ? { environments } : {}),
      }
    );

    console.log(
      "[INVITE] Invitation created:",
      result.invitationId,
      "token:",
      result.token
    );

    // Send invitation email
    const inviterName = convexUser.name || convexUser.email || "A team member";
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default

    console.log(
      "[INVITE] Sending email to:",
      email,
      "from:",
      inviterName,
      "org:",
      organization.name
    );

    const emailResult = await convex.action(api.emails.sendInvitationEmail, {
      to: email,
      inviterName,
      organizationName: organization.name,
      role,
      token: result.token,
      expiresAt,
    });

    console.log("[INVITE] Email result:", JSON.stringify(emailResult));

    if (!emailResult.success) {
      console.error(
        "[INVITE] Failed to send invitation email:",
        emailResult.error
      );
    }

    return NextResponse.json(
      {
        invitation: result,
        emailSent: emailResult.success,
        emailError: emailResult.error,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error inviting member:", error);
    const message = sanitizeConvexError(error);

    if (message.includes("already a member")) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 }
      );
    }

    if (message.includes("already pending")) {
      return NextResponse.json(
        { error: "An invitation is already pending for this email" },
        { status: 409 }
      );
    }

    return handleApiError(error, "Failed to invite member");
  }
}

/**
 * PATCH /api/organizations/[slug]/members - Update a member's role
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;

    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization is enforced in the Convex mutation (org:change_role is owner-only)
    const { userId: targetUserId, role } = validation.data;

    // Get target user info before updating
    const targetUser = await convex.query(api.users.getById, {
      userId: targetUserId as Id<"users">,
    });

    await createAuthedConvexClient(accessToken!).mutation(
      api.organizations.updateMemberRole,
      {
        organizationId,
        userId: targetUserId as Id<"users">,
        newRole: role,
      }
    );

    // Notify org members about the role change (non-blocking)
    const roleDisplay = ORG_ROLE_LABELS[role];
    notifyMemberUpdate(
      targetUserId as Id<"users">,
      targetUser?.name || targetUser?.email || "A member",
      organizationId,
      "role_changed",
      roleDisplay
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    reportApiError(error, "PATCH /api/organizations/[slug]/members");
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/[slug]/members - Remove a member
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;

    const { searchParams } = new URL(request.url);
    const targetUserIdParam = searchParams.get("userId");

    if (!targetUserIdParam) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Validate userId format
    if (!CONVEX_ID_PATTERN.test(targetUserIdParam)) {
      return NextResponse.json(
        { error: "Invalid userId format" },
        { status: 400 }
      );
    }

    const targetUserId = targetUserIdParam as Id<"users">;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization is enforced in the Convex mutation (assertOrgAction + assertCanManageUser)
    // Users can remove themselves; the mutation handles self-removal logic.

    // Get target user info before removing
    const targetUser = await convex.query(api.users.getById, {
      userId: targetUserId,
    });

    await createAuthedConvexClient(accessToken!).mutation(
      api.organizations.removeMember,
      {
        organizationId,
        userId: targetUserId,
      }
    );

    // Notify org members about the removal (non-blocking)
    notifyMemberUpdate(
      targetUserId,
      targetUser?.name || targetUser?.email || "A member",
      organizationId,
      "removed"
    );

    return NextResponse.json({ removed: true });
  } catch (error) {
    reportApiError(error, "DELETE /api/organizations/[slug]/members");
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}

/**
 * Notify org members about a team change (non-blocking).
 */
async function notifyMemberUpdate(
  subjectUserId: Id<"users">,
  memberName: string,
  organizationId: Id<"organizations">,
  updateType: "added" | "removed" | "role_changed",
  role?: string
) {
  try {
    const org = await convex.query(api.organizations.getById, {
      organizationId,
    });
    const members = await convex.query(api.organizations.getMembers, {
      organizationId,
    });
    const orgName = org?.name || "Unknown organization";

    for (const member of members) {
      if (!member?.user?.email || member.user._id === subjectUserId) continue;
      convex
        .action(api.emails.sendMemberUpdateEmail, {
          userId: member.user._id,
          to: member.user.email,
          organizationName: orgName,
          memberName,
          updateType,
          role,
        })
        .catch((err: unknown) =>
          log.error(
            "member_update_email_failed",
            { organizationId, updateType, subjectUserId },
            err
          )
        );
    }
  } catch (err) {
    log.error(
      "member_update_notification_failed",
      { organizationId, updateType, subjectUserId },
      err
    );
  }
}
