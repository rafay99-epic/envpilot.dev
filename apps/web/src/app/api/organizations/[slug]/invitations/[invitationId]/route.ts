import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { handleApiError } from "@/lib/api-errors";

type RouteParams = { params: Promise<{ slug: string; invitationId: string }> };

/**
 * DELETE /api/organizations/[slug]/invitations/[invitationId] - Cancel an invitation
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

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

    // Ensure the `users` row exists so the session JWT identity resolves in the
    // authenticated Convex calls below (authorization + actor derivation happen
    // server-side via requireAuthedUser / assertOrgAction).
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Verify invitation belongs to this organization before cancelling
    const invitations = await authed.query(
      api.features.organizations.invitations.listPendingByOrganization,
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

    await authed.mutation(api.features.organizations.invitations.cancel, {
      invitationId,
    });

    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error("Error cancelling invitation:", error);
    return handleApiError(error, "Failed to cancel invitation");
  }
}

/**
 * POST /api/organizations/[slug]/invitations/[invitationId]/resend - Resend an invitation
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();

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

    // getOrCreateConvexUser both guarantees the `users` row exists (so the
    // session JWT resolves in the authenticated calls below) and supplies the
    // inviter name for the resend email.
    const convexUser = await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Get organization details for the email
    const organization = await convex.query(
      api.features.organizations.queries.getById,
      {
        organizationId,
      }
    );

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get invitation details before resending
    const invitations = await authed.query(
      api.features.organizations.invitations.listPendingByOrganization,
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

    const result = await authed.mutation(
      api.features.organizations.invitations.resend,
      {
        invitationId,
      }
    );

    // Send the new invitation email
    const inviterName = convexUser.name || convexUser.email || "A team member";
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default

    const emailResult = await convex.action(
      api.features.emails.emails.sendInvitationEmail,
      {
        to: invitation.email,
        inviterName,
        organizationName: organization.name,
        role: invitation.role,
        token: result.token,
        expiresAt,
      }
    );

    if (!emailResult.success) {
      console.warn("Failed to send invitation email:", emailResult.error);
    }

    return NextResponse.json({
      resent: true,
      emailSent: emailResult.success,
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    return handleApiError(error, "Failed to resend invitation");
  }
}
