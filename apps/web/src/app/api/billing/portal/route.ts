import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { getPolarClient, isPaymentsEnabled } from "@/lib/polar";
import type { Id } from "@convex/_generated/dataModel";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const portalSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  returnUrl: z.string().url("Return URL must be a valid URL").optional(),
});

/**
 * POST /api/billing/portal
 * Create a Polar Customer Portal session for managing subscriptions
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
      api.features.billing.tierLimits.isPaymentsEnabled,
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

    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = portalSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { organizationId, returnUrl } = validation.data;

    // Get Convex user
    const convexUser = await convex.query(
      api.features.users.users.getByWorkosId,
      {
        workosId: user.id,
      }
    );

    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is admin of the organization
    const membership = await createAuthedConvexClient(accessToken!).query(
      api.features.organizations.queries.getMembership,
      {
        organizationId: organizationId as Id<"organizations">,
      }
    );

    // Billing management is owner-only (org:manage_billing)
    if (!membership || normalizeOrgRole(membership.role) !== "owner") {
      return NextResponse.json(
        { error: "Only the organization owner can access billing" },
        { status: 403 }
      );
    }

    // Get Polar customer — the caller's own first, fallback to org-level.
    // Both derive/gate identity inside Convex from the attached JWT.
    const authed = createAuthedConvexClient(accessToken!);
    let polarCustomer = await authed.query(
      api.features.billing.queries.getOwnPolarCustomer,
      {}
    );

    if (!polarCustomer) {
      polarCustomer = await authed.query(
        api.features.billing.queries.getPolarCustomer,
        {
          organizationId: organizationId as Id<"organizations">,
        }
      );
    }

    if (!polarCustomer) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe first." },
        { status: 404 }
      );
    }

    // Create Polar customer portal session
    const session = await polar.customerSessions.create({
      customerId: polarCustomer.polarCustomerId,
    });

    return NextResponse.json({
      portalUrl: session.customerPortalUrl,
    });
  } catch (error) {
    reportApiError(error, "POST /api/billing/portal");
    console.error("Error creating billing portal session:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create billing portal session";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
