import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { isPaymentsEnabled } from "@/lib/stripe";
import type { Id } from "@convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/billing/subscription?organizationId=xxx
 * Get subscription status for an organization
 */
export async function GET(request: Request) {
  try {
    // Check if payments are enabled
    if (!isPaymentsEnabled()) {
      return NextResponse.json(
        { error: "Payment system is currently disabled" },
        { status: 503 },
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
        { status: 400 },
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
        { status: 403 },
      );
    }

    // Get organization
    const organization = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get subscription
    const subscription = await convex.query(
      api.subscriptions.getByOrganization,
      {
        organizationId: organizationId as Id<"organizations">,
      },
    );

    // Get Stripe customer info
    const stripeCustomer = await convex.query(
      api.subscriptions.getStripeCustomer,
      {
        organizationId: organizationId as Id<"organizations">,
      },
    );

    return NextResponse.json({
      tier: organization.tier,
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
      hasStripeCustomer: !!stripeCustomer,
      canManageBilling: membership.role === "admin",
    });
  } catch (error) {
    console.error("Error getting subscription:", error);
    const message =
      error instanceof Error ? error.message : "Failed to get subscription";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
