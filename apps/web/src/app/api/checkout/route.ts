import { Polar } from "@polar-sh/sdk";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { isPaymentsEnabled } from "@/lib/polar";
import { sanitizeConvexError } from "@/lib/error-messages";

/**
 * GET /api/checkout?tier=<tier-name>   (default: "pro")
 *
 * THE single checkout entry point. Authenticated Polar checkout with
 * customer pre-creation.
 *
 * The Polar product is resolved SERVER-SIDE from the tier name
 * (paymentProducts, then legacy tierDefinitions.polarProductId) — a
 * client-supplied product id is never trusted. The legacy
 * `?products=<id>` form is accepted for old links but the id itself is
 * ignored; it simply means "the default paid tier".
 *
 * Flow:
 * 1. Authenticate user
 * 2. prepareCheckout (Convex) — org-creator check + double-subscribe guard
 * 3. Look up or create Polar customer (linked via externalId = convexUserId)
 * 4. Create checkout session with the existing customer
 * 5. Redirect to Polar's hosted checkout page
 *
 * This prevents "CheckoutCustomerDeleted" errors and ensures the customer
 * binding is always established before payment begins.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Check if payments are enabled (env var = outer gate)
  if (!isPaymentsEnabled()) {
    return NextResponse.redirect(new URL("/pricing", url.origin));
  }

  // Check if payments are enabled (DB toggle = inner gate, admin-controllable)
  const dbPaymentsEnabled = await convex.query(
    api.features.billing.tierLimits.isPaymentsEnabled,
    {}
  );
  if (!dbPaymentsEnabled) {
    return NextResponse.redirect(new URL("/pricing", url.origin));
  }

  const tierName = url.searchParams.get("tier") ?? "pro";

  // --- Authentication required ---
  const { user, accessToken: workosAccessToken } = await withAuth();

  if (!user) {
    // Redirect unauthenticated users to sign-in, then back to checkout
    const signInUrl = new URL("/sign-in", url.origin);
    signInUrl.searchParams.set("returnTo", url.pathname + url.search);
    return NextResponse.redirect(signInUrl.toString());
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Payment system is not configured" },
      { status: 503 }
    );
  }

  const polar = new Polar({
    accessToken,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
  });

  // Resolve Convex user so we can pass metadata for webhook processing
  let convexUser = await convex.query(api.features.users.users.getByWorkosId, {
    workosId: user.id,
  });

  if (!convexUser) {
    const userId = await convex.mutation(api.features.users.users.upsert, {
      workosId: user.id,
      email: user.email,
      name:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.firstName || user.lastName || undefined,
      avatarUrl: user.profilePictureUrl || undefined,
    });
    convexUser = await convex.query(api.features.users.users.getById, {
      userId,
    });
  }

  if (!convexUser) {
    return NextResponse.json(
      { error: "Failed to resolve user account" },
      { status: 500 }
    );
  }

  // Derive the app origin from the incoming request so redirects always
  // match the domain the user is on (localhost, ngrok, production).
  const origin = url.origin;
  const redirectWithError = (message: string) => {
    const errorUrl = new URL("/dashboard/checkout-success", origin);
    errorUrl.searchParams.set("error", message);
    return NextResponse.redirect(errorUrl.toString());
  };

  // Resolve the Polar product from the tier SERVER-SIDE:
  // paymentProducts first, legacy tierDefinitions.polarProductId fallback.
  const paymentProductId = await convex.query(
    api.features.billing.queries.getProductIdForTier,
    { tierName, provider: "polar" }
  );
  const tierDef = await convex.query(
    api.features.featureRegistry.queries.getTierByName,
    { name: tierName }
  );
  const polarProductId = paymentProductId ?? tierDef?.polarProductId;
  if (!polarProductId) {
    return redirectWithError(
      `The "${tierName}" plan is not available for purchase right now. Please contact support.`
    );
  }

  // Get user's billing organization: the org this account CREATED (the tier
  // resolver derives org features from the creator's tier), preferring it
  // over invited-into orgs.
  const organizations = await createAuthedConvexClient(
    workosAccessToken!
  ).query(api.features.organizations.queries.listForUser, {});
  const primaryOrg =
    organizations.find((o) => o && o.createdBy === convexUser._id) ??
    organizations[0];

  if (!primaryOrg) {
    return redirectWithError(
      "You need an organization before purchasing a plan. Create one first, then upgrade."
    );
  }

  // Authorization + double-subscribe guard (Convex verifies the caller is
  // the org's creating account and has no live subscription).
  try {
    const checkoutState = await createAuthedConvexClient(
      workosAccessToken!
    ).mutation(api.features.billing.checkout.prepareCheckout, {
      organizationId: primaryOrg._id,
    });
    if (checkoutState.status === "already_subscribed") {
      return NextResponse.redirect(
        new URL("/dashboard/settings?tab=billing&notice=already-pro", origin)
      );
    }
  } catch (error) {
    const clean = sanitizeConvexError(error);
    return redirectWithError(
      clean && clean !== "Server Error"
        ? clean
        : "Checkout isn't available right now. Please try again."
    );
  }

  // --- Ensure Polar customer exists BEFORE checkout ---
  // This prevents "CheckoutCustomerDeleted" 409 errors and ensures
  // we always have a valid customer binding.
  let polarCustomerId: string | undefined;

  try {
    // Try to find existing customer by external ID (our Convex user ID)
    const existingCustomer = await polar.customers.getExternal({
      externalId: convexUser._id,
    });
    polarCustomerId = existingCustomer.id;
  } catch {
    // Customer doesn't exist (404) or was deleted — create a fresh one
    try {
      const newCustomer = await polar.customers.create({
        email: user.email,
        externalId: convexUser._id,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName || user.lastName || undefined,
        metadata: {
          userId: convexUser._id,
          organizationId: primaryOrg._id,
          organizationName: primaryOrg.name,
        },
      });
      polarCustomerId = newCustomer.id;
    } catch (createErr) {
      console.error("Failed to create Polar customer:", createErr);
      Sentry.captureException(createErr, {
        tags: { source: "checkout", action: "create-customer" },
        extra: { userId: convexUser._id, email: user.email },
      });
      // If customer creation fails with conflict (email already exists),
      // try listing customers by email as a fallback
      try {
        const customerList = await polar.customers.list({
          email: user.email,
          limit: 1,
        });
        for await (const page of customerList) {
          if (page.result && page.result.items.length > 0) {
            polarCustomerId = page.result.items[0].id;
          }
          break; // Only need the first page
        }
      } catch (listErr) {
        console.error("Failed to list Polar customers:", listErr);
        Sentry.captureException(listErr, {
          tags: { source: "checkout", action: "list-customer-fallback" },
          extra: { userId: convexUser._id, email: user.email },
        });
      }
    }
  }

  const successUrl = `${origin}/dashboard/checkout-success?checkout_id={CHECKOUT_ID}`;

  // Client IP for Polar's tax/currency detection (first hop of
  // x-forwarded-for is the browser when behind Vercel's proxy).
  const customerIpAddress = req.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  try {
    const checkoutParams: Parameters<typeof polar.checkouts.create>[0] = {
      products: [polarProductId],
      successUrl,
      customerEmail: user.email,
      ...(customerIpAddress ? { customerIpAddress } : {}),
      metadata: {
        userId: convexUser._id,
        organizationId: primaryOrg._id,
        organizationName: primaryOrg.name,
        tierName,
      },
    };

    // If we have a Polar customer ID, use it directly (preferred).
    // Otherwise fall back to externalCustomerId for Polar to resolve.
    if (polarCustomerId) {
      checkoutParams.customerId = polarCustomerId;
    } else {
      checkoutParams.externalCustomerId = convexUser._id;
    }

    const result = await polar.checkouts.create(checkoutParams);

    return NextResponse.redirect(result.url);
  } catch (error) {
    console.error("Polar checkout error:", error);
    Sentry.captureException(error, {
      tags: { source: "checkout", action: "create-checkout" },
      extra: { userId: convexUser._id, tierName, polarProductId },
    });

    // User-friendly error page redirect instead of raw JSON error
    const errorMessage =
      error instanceof Error ? error.message : "Checkout failed";

    // If it's a customer-related error, provide a clearer message
    const isCustomerError =
      errorMessage.includes("Customer") ||
      errorMessage.includes("customer") ||
      errorMessage.includes("409");

    const userMessage = isCustomerError
      ? "There was an issue with your billing account. Please try again."
      : "Something went wrong during checkout. Please try again.";

    return redirectWithError(userMessage);
  }
}
