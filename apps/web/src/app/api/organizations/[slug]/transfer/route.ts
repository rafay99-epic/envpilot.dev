import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/feature-flags";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const transferSchema = z.object({
  targetUserEmail: z.string().email("A valid email address is required"),
});

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * POST /api/organizations/[slug]/transfer - Transfer organization ownership
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

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
    const validation = transferSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { targetUserEmail } = validation.data;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check admin
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can transfer organization ownership" },
        { status: 403 }
      );
    }

    // Tier enforcement
    if (isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS)) {
      const org = await convex.query(api.organizations.getById, {
        organizationId,
      });

      if (org?.tier !== "pro") {
        return NextResponse.json(
          {
            error: "Organization must be on the Pro plan to transfer ownership",
          },
          { status: 403 }
        );
      }
    }

    // Look up target user by email
    const targetUser = await convex.query(api.users.getByEmail, {
      email: targetUserEmail,
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with that email address" },
        { status: 404 }
      );
    }

    if (targetUser._id === convexUser._id) {
      return NextResponse.json(
        { error: "You cannot transfer ownership to yourself" },
        { status: 400 }
      );
    }

    // Get org details for email notifications
    const org = await convex.query(api.organizations.getById, {
      organizationId,
    });

    // Execute the transfer
    await convex.mutation(api.organizations.transferOwnership, {
      organizationId,
      targetUserId: targetUser._id,
      transferredBy: convexUser._id,
      enforceTierLimits: isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS),
    });

    const orgName = org?.name || "the organization";
    const previousOwnerName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email;

    // Send email to new owner (non-blocking)
    try {
      await convex.action(api.emails.sendOrgTransferEmail, {
        to: targetUserEmail,
        organizationName: orgName,
        previousOwnerName,
        orgSlug: slug,
      });
    } catch (emailErr) {
      console.warn(
        "[EMAIL] Failed to send transfer email to new owner:",
        emailErr
      );
    }

    // Send confirmation to previous owner (non-blocking)
    try {
      await convex.action(api.emails.sendOrgTransferConfirmationEmail, {
        to: user.email,
        organizationName: orgName,
        newOwnerEmail: targetUserEmail,
        orgSlug: slug,
      });
    } catch (emailErr) {
      console.warn(
        "[EMAIL] Failed to send transfer confirmation to previous owner:",
        emailErr
      );
    }

    return NextResponse.json({
      success: true,
      transferredTo: targetUserEmail,
    });
  } catch (error) {
    console.error("Error transferring organization:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to transfer organization";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
