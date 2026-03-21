import { Polar } from "@polar-sh/sdk";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/checkout?products=<product-id>
 *
 * Authenticated Polar checkout with customer pre-creation.
 *
 * Following the "always ensure customer exists BEFORE checkout" pattern:
 * 1. Authenticate user
 * 2. Look up or create Polar customer (linked via externalId = convexUserId)
 * 3. Create checkout session with the existing customer
 * 4. Redirect to Polar's hosted checkout page
 *
 * This prevents "CheckoutCustomerDeleted" errors and ensures the customer
 * binding is always established before payment begins.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const products = url.searchParams.getAll("products");

  if (products.length === 0) {
    return NextResponse.json(
      { error: "Missing products in query params" },
      { status: 400 }
    );
  }

  // --- Authentication required ---
  const { user } = await withAuth();

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
      { error: "Failed to resolve user account" },
      { status: 500 }
    );
  }

  // Get user's first owned organization for billing association
  const organizations = await convex.query(api.organizations.listForUser, {
    userId: convexUser._id,
  });
  const primaryOrg = organizations[0];

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
          organizationId: primaryOrg?._id ?? "",
          organizationName: primaryOrg?.name ?? "",
        },
      });
      polarCustomerId = newCustomer.id;
    } catch (createErr) {
      console.error("Failed to create Polar customer:", createErr);
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
      }
    }
  }

  // Derive the app origin from the incoming request so the success redirect
  // always matches the domain the user is on (localhost, ngrok, production).
  const origin = url.origin;
  const successUrl = `${origin}/dashboard/checkout-success?checkout_id={CHECKOUT_ID}`;

  try {
    const checkoutParams: Parameters<typeof polar.checkouts.create>[0] = {
      products,
      successUrl,
      customerEmail: user.email,
      metadata: {
        userId: convexUser._id,
        organizationId: primaryOrg?._id ?? "",
        organizationName: primaryOrg?.name ?? "",
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

    const errorUrl = new URL("/dashboard/checkout-success", origin);
    errorUrl.searchParams.set("error", userMessage);
    return NextResponse.redirect(errorUrl.toString());
  }
}
