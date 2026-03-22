import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { getPolarClient, isPaymentsEnabled } from "@/lib/polar";
import type { Id } from "@convex/_generated/dataModel";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const checkoutSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  tierName: z.string().min(1, "Tier name is required"),
  successUrl: z.string().url("Success URL must be a valid URL"),
  cancelUrl: z.string().url("Cancel URL must be a valid URL"),
});

/**
 * POST /api/billing/checkout
 * Create a Polar checkout session for upgrading to a paid tier.
 *
 * Uses dynamic tier selection via `tierName` param.
 * Looks up the Polar product ID from tierDefinitions.
 */
export async function POST(request: Request) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

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
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { organizationId, tierName, successUrl, cancelUrl } = validation.data;

    // Get Convex user
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

    // Look up Polar product ID — try paymentProducts first, fall back to tierDefinitions
    const paymentProductId = await convex.query(
      api.subscriptions.getProductIdForTier,
      { tierName, provider: "polar" }
    );
    const tierDef = await convex.query(api.featureRegistry.getTierByName, {
      name: tierName,
    });
    const polarProductId = paymentProductId ?? tierDef?.polarProductId;
    if (!polarProductId) {
      return NextResponse.json(
        { error: `Tier "${tierName}" has no associated Polar product` },
        { status: 400 }
      );
    }

    // Verify checkout is allowed (user is admin, no active subscription)
    const checkoutData = await convex.mutation(
      api.subscriptions.prepareCheckout,
      {
        organizationId: organizationId as Id<"organizations">,
        userId: convexUser._id,
      }
    );

    // Get organization details
    const organization = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Create Polar checkout session
    const checkout = await polar.checkouts.create({
      products: [polarProductId],
      successUrl,
      customerEmail: user.email,
      externalCustomerId: convexUser._id,
      metadata: {
        organizationId,
        userId: convexUser._id,
        organizationName: organization.name,
        tierName,
      },
    });

    return NextResponse.json({
      checkoutUrl: checkout.url,
      sessionId: checkout.id,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create checkout session";

    // Check for specific error types
    if (
      message.includes("already has an active subscription") ||
      message.includes("You already have an active subscription")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message.includes("Only organization admins")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
