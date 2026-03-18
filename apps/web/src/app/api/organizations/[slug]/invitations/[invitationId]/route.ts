import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type RouteParams = { params: Promise<{ slug: string; invitationId: string }> };

/**
 * DELETE /api/organizations/[slug]/invitations/[invitationId] - Cancel an invitation
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const resolved = await resolveOrgBySlug(convex, resolvedParams.slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const invitationId = resolvedParams.invitationId as Id<"invitations">;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check if user can cancel invitations (admin or team_lead)
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "team_lead")
    ) {
      return NextResponse.json(
        { error: "Only admins and team leads can cancel invitations" },
        { status: 403 }
      );
    }

    // Verify invitation belongs to this organization before cancelling
    const invitations = await convex.query(
      api.invitations.listPendingByOrganization,
      {
        organizationId,
      }
    );

    const invitation = invitations.find((inv) => inv._id === invitationId);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found in this organization" },
        { status: 404 }
      );
    }

    await convex.mutation(api.invitations.cancel, {
      invitationId,
      cancelledBy: convexUser._id,
    });

    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error("Error cancelling invitation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to cancel invitation";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/organizations/[slug]/invitations/[invitationId]/resend - Resend an invitation
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const resolved = await resolveOrgBySlug(convex, resolvedParams.slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const invitationId = resolvedParams.invitationId as Id<"invitations">;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check if user can resend invitations (admin or team_lead)
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "team_lead")
    ) {
      return NextResponse.json(
        { error: "Only admins and team leads can resend invitations" },
        { status: 403 }
      );
    }

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

    // Get invitation details before resending
    const invitations = await convex.query(
      api.invitations.listPendingByOrganization,
      {
        organizationId,
      }
    );

    const invitation = invitations.find((inv) => inv._id === invitationId);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or not pending" },
        { status: 404 }
      );
    }

    const result = await convex.mutation(api.invitations.resend, {
      invitationId,
      resentBy: convexUser._id,
    });

    // Send the new invitation email
    const inviterName = convexUser.name || convexUser.email || "A team member";
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default

    const emailResult = await convex.action(api.emails.sendInvitationEmail, {
      to: invitation.email,
      inviterName,
      organizationName: organization.name,
      role: invitation.role,
      token: result.token,
      expiresAt,
    });

    if (!emailResult.success) {
      console.warn("Failed to send invitation email:", emailResult.error);
    }

    return NextResponse.json({
      resent: true,
      emailSent: emailResult.success,
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to resend invitation";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
