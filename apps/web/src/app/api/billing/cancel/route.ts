import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { getPolarClient, isPaymentsEnabled } from "@/lib/polar";
import type { Id } from "@convex/_generated/dataModel";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const cancelSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  reason: z
    .enum([
      "too_expensive",
      "missing_features",
      "switched_service",
      "unused",
      "customer_service",
      "low_quality",
      "too_complex",
      "other",
    ])
    .optional(),
  comment: z.string().max(1000).optional(),
});

/**
 * POST /api/billing/cancel
 * Cancel a subscription at the end of the current billing period
 */
export async function POST(request: Request) {
  try {
    // Check if payments are enabled (env var = outer gate)
    if (!isPaymentsEnabled()) {
      return NextResponse.json(
        { error: "Payment system is currently disabled" },
        { status: 503 }
      );
    }

    // Check if payments are enabled (DB toggle = inner gate, admin-controllable)
    const dbPaymentsEnabled = await convex.query(
      api.tierLimits.isPaymentsEnabled,
      {}
    );
    if (!dbPaymentsEnabled) {
      return NextResponse.json(
        { error: "Payment system is currently disabled by admin" },
        { status: 503 }
      );
    }

    const polar = getPolarClient();

    if (!polar) {
      return NextResponse.json(
        { error: "Payment system is not properly configured" },
        { status: 503 }
      );
    }

    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = cancelSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { organizationId, reason, comment } = validation.data;

    // Get Convex user
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });

    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is admin of the organization
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<"organizations">,
      userId: convexUser._id,
    });

    // Billing management is owner-only (org:manage_billing)
    if (!membership || normalizeOrgRole(membership.role) !== "owner") {
      return NextResponse.json(
        { error: "Only the organization owner can cancel subscriptions" },
        { status: 403 }
      );
    }

    // Get the subscription — try user-level first, fallback to org-level
    let subscription = await convex.query(api.subscriptions.getByUser, {
      userId: convexUser._id,
    });

    if (!subscription) {
      subscription = await convex.query(api.subscriptions.getByOrganization, {
        organizationId: organizationId as Id<"organizations">,
      });
    }

    if (!subscription || !subscription.polarSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    // Cancel via Polar API — sets cancelAtPeriodEnd
    await polar.subscriptions.update({
      id: subscription.polarSubscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
        ...(reason && { customerCancellationReason: reason }),
        ...(comment && { customerCancellationComment: comment }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportApiError(error, "POST /api/billing/cancel");
    console.error("Error canceling subscription:", error);
    const message =
      error instanceof Error ? error.message : "Failed to cancel subscription";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
