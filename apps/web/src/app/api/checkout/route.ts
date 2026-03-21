import { Polar } from "@polar-sh/sdk";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/checkout?products=<product-id>
 *
 * Authenticated Polar checkout redirect. Requires the user to be logged in
 * so we can attach their userId, email, and organization to the checkout
 * metadata. After payment, Polar sends a webhook that uses this metadata
 * to link the subscription to the correct user and organization.
 *
 * If the user is not logged in, they are redirected to sign-in first.
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

  // Get user's first owned organization for billing association
  const organizations = convexUser
    ? await convex.query(api.organizations.listForUser, {
        userId: convexUser._id,
      })
    : [];
  const primaryOrg = organizations[0];

  // Derive the app origin from the incoming request so the success redirect
  // always matches the domain the user is on (localhost, ngrok, production).
  const origin = url.origin;
  const successUrl = `${origin}/dashboard/checkout-success?checkout_id={CHECKOUT_ID}`;

  try {
    const result = await polar.checkouts.create({
      products,
      successUrl,
      customerEmail: user.email,
      externalCustomerId: convexUser?._id,
      metadata: {
        userId: convexUser?._id ?? "",
        organizationId: primaryOrg?._id ?? "",
        organizationName: primaryOrg?.name ?? "",
      },
    });

    return NextResponse.redirect(result.url);
  } catch (error) {
    console.error("Polar checkout error:", error);
    const message =
      error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
