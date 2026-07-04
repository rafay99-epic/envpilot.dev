import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { isPaymentsEnabled } from "@/lib/polar";
import type { Id } from "@convex/_generated/dataModel";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/billing/subscription?organizationId=xxx
 * Get subscription status for an organization.
 *
 * Now returns user-level tier info alongside org-level subscription data.
 */
export async function GET(request: Request) {
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

    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Get Convex user
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });

    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is a member of the organization
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<"organizations">,
      userId: convexUser._id,
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // Get organization
    const organization = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get user-level tier info (primary source of truth)
    const userTierInfo = await convex.query(
      api.featureRegistry.getUserTierInfo,
      { userId: organization.createdBy }
    );

    // Get subscription — try user-level first, fallback to org-level
    let subscription = await convex.query(api.subscriptions.getByUser, {
      userId: organization.createdBy,
    });

    if (!subscription) {
      subscription = await convex.query(api.subscriptions.getByOrganization, {
        organizationId: organizationId as Id<"organizations">,
      });
    }

    // Get Polar customer — try user-level first, fallback to org-level
    let polarCustomer = await convex.query(
      api.subscriptions.getPolarCustomerByUser,
      { userId: organization.createdBy }
    );

    if (!polarCustomer) {
      polarCustomer = await convex.query(api.subscriptions.getPolarCustomer, {
        organizationId: organizationId as Id<"organizations">,
      });
    }

    return NextResponse.json({
      tier: userTierInfo?.tier ?? "free",
      graceActive: userTierInfo?.graceActive ?? false,
      gracePeriodEnd: userTierInfo?.gracePeriodEnd ?? null,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            cancelAt: subscription.cancelAt,
            trialEnd: subscription.trialEnd,
          }
        : null,
      hasBillingCustomer: !!polarCustomer,
      canManageBilling: normalizeOrgRole(membership.role) === "owner",
    });
  } catch (error) {
    reportApiError(error, "GET /api/billing/subscription");
    console.error("Error getting subscription:", error);
    const message =
      error instanceof Error ? error.message : "Failed to get subscription";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
