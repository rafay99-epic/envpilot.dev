import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import {
  getStripeClient,
  getStripeWebhookSecret,
  isPaymentsEnabled,
} from "@/lib/stripe";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Stripe Webhook Handler
 *
 * Verifies the Stripe signature, then dispatches the event to the Convex
 * processWebhookEvent action. All business logic (customer lookups, subscription
 * updates, tier syncing) is handled server-side in Convex internal mutations.
 *
 * Events handled:
 * - checkout.session.completed
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */
export async function POST(request: Request) {
  // Check if payments are enabled
  if (!isPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Payment system is disabled" },
      { status: 503 }
    );
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  if (!stripe || !webhookSecret) {
    console.error("Stripe is not properly configured");
    return NextResponse.json(
      { error: "Payment system is not configured" },
      { status: 503 }
    );
  }

  // Get the raw body and signature
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  try {
    // Dispatch the verified event to Convex for processing.
    // All billing mutations are internal — only this action gateway is public.
    await convex.action(api.subscriptions.processWebhookEvent, {
      type: event.type,
      data: JSON.stringify(event.data.object),
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
