import { Polar } from "@polar-sh/sdk";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { isPaymentsEnabled } from "@/lib/polar";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/billing/sync?checkout_id=<id>
 *
 * Eagerly sync subscription state after checkout success.
 *
 * Following the Theo/T3 Chat pattern: the user often lands on the success
 * page BEFORE the webhook arrives. This endpoint fetches the checkout state
 * directly from Polar's API and triggers the same processWebhookEvent
 * handler, ensuring the user's tier is updated immediately.
 *
 * This is NOT a replacement for webhooks — webhooks are still the source
 * of truth for all subscription lifecycle events. This just handles the
 * race condition where the user arrives before the webhook.
 */
export async function POST(req: Request) {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ error: "Payments disabled" }, { status: 503 });
  }

  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const checkoutId = url.searchParams.get("checkout_id");

  if (!checkoutId) {
    return NextResponse.json({ error: "Missing checkout_id" }, { status: 400 });
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Payment system not configured" },
      { status: 503 }
    );
  }

  const polar = new Polar({
    accessToken,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
  });

  try {
    // Fetch the checkout from Polar to get the subscription details
    const checkout = await polar.checkouts.get({ id: checkoutId });

    // Only process if checkout succeeded and has a subscription
    if (checkout.status !== "succeeded") {
      return NextResponse.json({
        synced: false,
        reason: `Checkout status is ${checkout.status}, not succeeded`,
      });
    }

    // Dispatch a checkout.updated event to our existing handler
    // This is idempotent — if the webhook already processed it, the
    // handler will update the same records with the same data.
    await convex.action(api.subscriptions.processWebhookEvent, {
      type: "checkout.updated",
      data: JSON.stringify(checkout),
    });

    return NextResponse.json({ synced: true });
  } catch (error) {
    console.error("Billing sync error:", error);
    // Don't return 500 — the webhook will handle it. Just log and move on.
    return NextResponse.json({
      synced: false,
      reason: "Sync failed, webhook will handle tier update",
    });
  }
}
