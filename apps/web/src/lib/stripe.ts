import Stripe from "stripe";

/**
 * Stripe Client Configuration
 *
 * Provides a configured Stripe client for server-side payment operations.
 * The payment system can be enabled/disabled via environment variables.
 */

// Check if payments are enabled
export const isPaymentsEnabled = () => {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
};

// Validate Stripe configuration
const validateStripeConfig = () => {
  if (!isPaymentsEnabled()) {
    return { valid: false, reason: "Payments are disabled" };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { valid: false, reason: "STRIPE_SECRET_KEY is not configured" };
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return { valid: false, reason: "STRIPE_WEBHOOK_SECRET is not configured" };
  }

  if (!process.env.STRIPE_PRO_PRICE_ID) {
    return { valid: false, reason: "STRIPE_PRO_PRICE_ID is not configured" };
  }

  return { valid: true, reason: null };
};

// Lazy-initialized Stripe client
let stripeClient: Stripe | null = null;

/**
 * Get the Stripe client instance
 * Returns null if payments are disabled or not configured
 */
export const getStripeClient = (): Stripe | null => {
  if (!isPaymentsEnabled()) {
    return null;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
      typescript: true,
    });
  }

  return stripeClient;
};

/**
 * Get the Stripe webhook secret
 */
export const getStripeWebhookSecret = (): string | null => {
  if (!isPaymentsEnabled()) {
    return null;
  }
  return process.env.STRIPE_WEBHOOK_SECRET || null;
};

/**
 * Get the Pro tier price ID
 */
export const getProPriceId = (): string | null => {
  if (!isPaymentsEnabled()) {
    return null;
  }
  return process.env.STRIPE_PRO_PRICE_ID || null;
};

/**
 * Get Stripe configuration status
 */
export const getStripeConfigStatus = () => {
  return validateStripeConfig();
};

/**
 * Stripe subscription status mapping to our tier system
 */
export const mapSubscriptionStatusToTier = (
  status: Stripe.Subscription.Status,
): "free" | "pro" => {
  // Active and trialing subscriptions get Pro tier
  if (status === "active" || status === "trialing") {
    return "pro";
  }

  // All other statuses (incomplete, incomplete_expired, past_due, canceled, unpaid, paused)
  // revert to free tier
  return "free";
};

/**
 * Stripe price IDs (can be extended for multiple tiers in the future)
 */
export const STRIPE_PRICE_IDS = {
  pro: () => process.env.STRIPE_PRO_PRICE_ID || "",
} as const;

export type StripePriceTier = keyof typeof STRIPE_PRICE_IDS;
