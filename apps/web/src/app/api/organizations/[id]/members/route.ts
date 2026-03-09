import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { sendInvitationEmail } from "@/lib/email";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Convex ID pattern - alphanumeric characters only
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "team_lead", "member"]),
});

const updateRoleSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  role: z.enum(["admin", "team_lead", "member"]),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/organizations/[id]/members - List all members
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const organizationId = resolvedParams.id as Id<"organizations">;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    const members = await convex.query(api.organizations.getMembers, {
      organizationId,
    });

    // Also get pending invitations
    const invitations = await convex.query(
      api.invitations.listPendingByOrganization,
      {
        organizationId,
      },
    );

    return NextResponse.json({ members, invitations });
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/organizations/[id]/members - Invite a new member
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const organizationId = resolvedParams.id as Id<"organizations">;

    const body = await request.json();
    const validation = inviteMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check if user can invite (admin or team_lead)
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "team_lead")
    ) {
      return NextResponse.json(
        { error: "Only admins and team leads can invite members" },
        { status: 403 },
      );
    }

    // Team leads can only invite members, not admins
    if (membership.role === "team_lead" && validation.data.role === "admin") {
      return NextResponse.json(
        { error: "Team leads cannot invite admins" },
        { status: 403 },
      );
    }

    const { email, role } = validation.data;

    // Get organization details for the email
    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const result = await convex.mutation(api.invitations.create, {
      email,
      organizationId,
      role,
      invitedBy: convexUser._id,
    });

    // Send invitation email
    const inviterName = convexUser.name || convexUser.email || "A team member";
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default

    const emailResult = await sendInvitationEmail({
      to: email,
      inviterName,
      organizationName: organization.name,
      role,
      token: result.token,
      expiresAt,
    });

    if (!emailResult.success) {
      console.warn("Failed to send invitation email:", emailResult.error);
    }

    return NextResponse.json(
      {
        invitation: result,
        emailSent: emailResult.success,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error inviting member:", error);
    const message =
      error instanceof Error ? error.message : "Failed to invite member";

    if (message.includes("already a member")) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    if (message.includes("already pending")) {
      return NextResponse.json(
        { error: "An invitation is already pending for this email" },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/organizations/[id]/members - Update a member's role
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const organizationId = resolvedParams.id as Id<"organizations">;

    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Only admins can change roles
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can change member roles" },
        { status: 403 },
      );
    }

    const { userId: targetUserId, role } = validation.data;

    await convex.mutation(api.organizations.updateMemberRole, {
      organizationId,
      userId: targetUserId as Id<"users">,
      newRole: role,
      updatedBy: convexUser._id,
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/organizations/[id]/members - Remove a member
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const organizationId = resolvedParams.id as Id<"organizations">;

    const { searchParams } = new URL(request.url);
    const targetUserIdParam = searchParams.get("userId");

    if (!targetUserIdParam) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    // Validate userId format
    if (!CONVEX_ID_PATTERN.test(targetUserIdParam)) {
      return NextResponse.json(
        { error: "Invalid userId format" },
        { status: 400 },
      );
    }

    const targetUserId = targetUserIdParam as Id<"users">;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Users can remove themselves, or admins can remove others
    const isRemovingSelf = targetUserId === convexUser._id;

    if (!isRemovingSelf) {
      const membership = await convex.query(api.organizations.getMembership, {
        organizationId,
        userId: convexUser._id,
      });

      if (!membership || membership.role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can remove other members" },
          { status: 403 },
        );
      }
    }

    await convex.mutation(api.organizations.removeMember, {
      organizationId,
      userId: targetUserId,
      removedBy: convexUser._id,
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 },
    );
  }
}
