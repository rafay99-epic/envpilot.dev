import { NextResponse } from "next/server";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import {
  getPolarWebhookSecret,
  isPaymentsEnabled,
} from "@/lib/polar";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Polar.sh Webhook Handler
 *
 * Verifies the Polar webhook signature using the Standard Webhooks spec,
 * then dispatches the event to the Convex processWebhookEvent action.
 * All business logic (customer lookups, subscription updates, tier syncing)
 * is handled server-side in Convex internal mutations.
 *
 * Events handled:
 * - checkout.updated (status=succeeded)
 * - subscription.created
 * - subscription.active
 * - subscription.updated
 * - subscription.canceled
 * - subscription.revoked
 * - subscription.uncanceled
 * - order.paid
 */
export async function POST(request: Request) {
  // Check if payments are enabled
  if (!isPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Payment system is disabled" },
      { status: 503 }
    );
  }

  const webhookSecret = getPolarWebhookSecret();

  if (!webhookSecret) {
    console.error("Polar webhook secret is not configured");
    return NextResponse.json(
      { error: "Payment system is not configured" },
      { status: 503 }
    );
  }

  // Get the raw body and headers
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: ReturnType<typeof validateEvent>;

  try {
    event = validateEvent(body, headers, webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook verification error:", message);
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
      { status: 400 }
    );
  }

  try {
    // Dispatch the verified event to Convex for processing.
    // All billing mutations are internal — only this action gateway is public.
    await convex.action(api.subscriptions.processWebhookEvent, {
      type: event.type,
      data: JSON.stringify(event.data),
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
