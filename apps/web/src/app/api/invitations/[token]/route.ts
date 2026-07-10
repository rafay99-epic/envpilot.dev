import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ACTIVE_ORG_COOKIE_TTL_SECONDS,
} from "@/lib/organization-context";
import { createLogger } from "@/lib/logger";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const log = createLogger("api/invitations");

type RouteParams = { params: Promise<{ token: string }> };

/**
 * GET /api/invitations/[token] - Get invitation details
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const { token } = resolvedParams;

    const invitation = await convex.query(
      api.features.organizations.invitations.getByToken,
      {
        token,
      }
    );

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Check if expired
    if (invitation.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: "Invitation has expired", status: "expired" },
        { status: 410 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        {
          error: `Invitation has already been ${invitation.status}`,
          status: invitation.status,
        },
        { status: 410 }
      );
    }

    return NextResponse.json({
      invitation: {
        email: invitation.email,
        role: normalizeOrgRole(invitation.role),
        organization: invitation.organization,
        invitedBy: invitation.invitedByUser,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    reportApiError(error, "GET /api/invitations/[token]");
    console.error("Error fetching invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invitations/[token] - Accept an invitation
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { token } = resolvedParams;

    // Ensure user exists in Convex
    let convexUser = await convex.query(
      api.features.users.users.getByWorkosId,
      {
        workosId: user.id,
      }
    );

    if (!convexUser) {
      const userId = await convex.mutation(api.features.users.users.upsert, {
        workosId: user.id,
        email: user.email,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName || user.lastName || undefined,
        avatarUrl: user.profilePictureUrl || undefined,
      });
      convexUser = await convex.query(api.features.users.users.getById, {
        userId,
      });
    }

    if (!convexUser) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    // The accepting user is derived server-side from the session JWT
    // (requireAuthedUser); the getByWorkosId/upsert above guarantees the
    // `users` row exists so that identity resolves.
    const organizationId = await createAuthedConvexClient(
      accessToken!
    ).mutation(api.features.organizations.invitations.accept, {
      token,
    });

    const organization = await convex.query(
      api.features.organizations.queries.getById,
      {
        organizationId,
      }
    );

    // Notify existing org members about the new member (non-blocking)
    notifyMemberUpdate(
      convexUser._id,
      convexUser.name || convexUser.email || "A new member",
      organizationId,
      "added"
    );

    const response = NextResponse.json({
      accepted: true,
      organization,
    });
    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, organizationId, {
      path: "/",
      sameSite: "lax",
      maxAge: ACTIVE_ORG_COOKIE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Error accepting invitation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to accept invitation";

    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (message.includes("expired")) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 410 }
      );
    }

    if (message.includes("Already a member")) {
      return NextResponse.json(
        { error: "You are already a member of this organization" },
        { status: 409 }
      );
    }

    reportApiError(error, "POST /api/invitations/[token]");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/invitations/[token] - Decline an invitation
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
    const resolvedParams = await params;
    const { token } = resolvedParams;

    // Declining is anonymous-capable. When the invitee is signed in, use an
    // authenticated client so the decline is attributed to their verified JWT
    // identity (getAuthedUser); otherwise fall back to the anonymous client and
    // the mutation records no actor.
    const client =
      user && accessToken ? createAuthedConvexClient(accessToken) : convex;

    await client.mutation(api.features.organizations.invitations.decline, {
      token,
    });

    return NextResponse.json({ declined: true });
  } catch (error) {
    reportApiError(error, "DELETE /api/invitations/[token]");
    console.error("Error declining invitation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to decline invitation";

    return NextResponse.json({ error: message }, { status: 500 });
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
    const org = await convex.query(api.features.organizations.queries.getById, {
      organizationId,
    });
    const members = await convex.query(
      api.features.organizations.queries.getMembers,
      {
        organizationId,
      }
    );
    const orgName = org?.name || "Unknown organization";

    for (const member of members) {
      if (!member?.user?.email || member.user._id === subjectUserId) continue;
      convex
        .action(api.features.emails.emails.sendMemberUpdateEmail, {
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
