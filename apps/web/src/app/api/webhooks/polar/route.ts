import { NextResponse } from "next/server";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import * as Sentry from "@sentry/nextjs";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { getPolarWebhookSecret, isPaymentsEnabled } from "@/lib/polar";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/webhooks/polar");

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
    // Alerts on purpose: without this, every Polar webhook 503s, so a
    // customer can pay and never be upgraded, with nothing to show it.
    log.error("polar_webhook_secret_missing");
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
      // warn, not error: unsigned probes hit this route constantly, and
      // alerting on each one would bury the failures that matter. It shows
      // up as context on any later Issue.
      log.warn("polar_webhook_signature_invalid", { reason: err.message });
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn("polar_webhook_verification_failed", { reason: message });
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
      { status: 400 }
    );
  }

  // The Convex action is public (this server has no Convex admin identity),
  // so the signature check above is only half the trust boundary — the
  // action re-authenticates every call via this shared bridge secret.
  const bridgeSecret = process.env.BILLING_WEBHOOK_BRIDGE_SECRET;
  if (!bridgeSecret) {
    // Same class of failure as the missing webhook secret: verified events
    // arrive and are then dropped before Convex ever sees them.
    log.error("billing_webhook_bridge_secret_missing", {
      eventType: event.type,
    });
    return NextResponse.json(
      { error: "Payment system is not configured" },
      { status: 503 }
    );
  }

  try {
    // Dispatch the verified event to Convex for processing.
    // All billing mutations are internal — only this action gateway is public.

    // Extract webhook-id for deduplication
    const webhookId = request.headers.get("webhook-id") ?? undefined;

    await convex.action(api.features.billing.webhooks.processWebhookEvent, {
      type: event.type,
      data: JSON.stringify(event.data),
      webhookId,
      bridgeSecret,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    // Money path — Convex dispatch failed after signature verification
    // succeeded. Capture with event context (never the raw payload/secret).
    Sentry.captureException(error, {
      tags: { source: "polar-webhook", action: "dispatch" },
      extra: {
        eventType: event.type,
        webhookId: request.headers.get("webhook-id") ?? undefined,
      },
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
