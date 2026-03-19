import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import {
  getStripeClient,
  getProPriceId,
  isPaymentsEnabled,
} from "@/lib/stripe";
import type { Id } from "@convex/_generated/dataModel";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const checkoutSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  tierName: z.string().optional(), // Dynamic tier selection (new)
  successUrl: z.string().url("Success URL must be a valid URL"),
  cancelUrl: z.string().url("Cancel URL must be a valid URL"),
});

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout session for upgrading to a paid tier.
 *
 * Supports dynamic tier selection via `tierName` param.
 * Falls back to STRIPE_PRO_PRICE_ID for backward compat if no tierName given.
 */
export async function POST(request: Request) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    // Check if payments are enabled
    if (!isPaymentsEnabled()) {
      return NextResponse.json(
        { error: "Payment system is currently disabled" },
        { status: 503 }
      );
    }

    const stripe = getStripeClient();

    if (!stripe) {
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

    // Resolve price ID: dynamic tier lookup or legacy fallback
    let priceId: string | null = null;
    let resolvedTierName = tierName;

    if (tierName) {
      // Dynamic: look up stripePriceId from tierDefinitions
      const tierDef = await convex.query(api.featureRegistry.getTierByName, {
        name: tierName,
      });
      if (!tierDef?.stripePriceId) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has no associated price` },
          { status: 400 }
        );
      }
      priceId = tierDef.stripePriceId;
    } else {
      // Legacy fallback: use STRIPE_PRO_PRICE_ID env var
      priceId = getProPriceId();
      resolvedTierName = "pro";
    }

    if (!priceId) {
      return NextResponse.json(
        { error: "Payment system is not properly configured" },
        { status: 503 }
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

    // Build checkout session options
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organizationId,
        userId: convexUser._id,
        organizationName: organization.name,
        tierName: resolvedTierName || "pro",
      },
      subscription_data: {
        metadata: {
          organizationId,
          userId: convexUser._id,
          tierName: resolvedTierName || "pro",
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
    };

    // If we already have a Stripe customer, use it
    if (checkoutData.stripeCustomerId) {
      sessionParams.customer = checkoutData.stripeCustomerId;
    } else {
      // Otherwise, let Stripe create a new customer
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
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
