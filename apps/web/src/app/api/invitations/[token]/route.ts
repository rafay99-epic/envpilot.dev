import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ACTIVE_ORG_COOKIE_TTL_SECONDS,
} from "@/lib/organization-context";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type RouteParams = { params: Promise<{ token: string }> };

/**
 * GET /api/invitations/[token] - Get invitation details
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const { token } = resolvedParams;

    const invitation = await convex.query(api.invitations.getByToken, {
      token,
    });

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
        role: invitation.role,
        organization: invitation.organization,
        invitedBy: invitation.invitedByUser,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
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
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { token } = resolvedParams;

    // Ensure user exists in Convex
    let convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });

    if (!convexUser) {
      const userId = await convex.mutation(api.users.upsert, {
        workosId: user.id,
        email: user.email,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName || user.lastName || undefined,
        avatarUrl: user.profilePictureUrl || undefined,
      });
      convexUser = await convex.query(api.users.getById, { userId });
    }

    if (!convexUser) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    const organizationId = await convex.mutation(api.invitations.accept, {
      token,
      userId: convexUser._id,
    });

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

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

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/invitations/[token] - Decline an invitation
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const resolvedParams = await params;
    const { token } = resolvedParams;

    // Get user ID if authenticated (optional for declining)
    let convexUserId = undefined;
    if (user) {
      const convexUser = await convex.query(api.users.getByWorkosId, {
        workosId: user.id,
      });
      convexUserId = convexUser?._id;
    }

    await convex.mutation(api.invitations.decline, {
      token,
      userId: convexUserId,
    });

    return NextResponse.json({ declined: true });
  } catch (error) {
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
    const org = await convex.query(api.organizations.getById, { organizationId });
    const members = await convex.query(api.organizations.getMembers, { organizationId });
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
          console.warn("[EMAIL] Member update notification failed:", err)
        );
    }
  } catch (err) {
    console.warn("[EMAIL] Error sending member update notifications:", err);
  }
}
