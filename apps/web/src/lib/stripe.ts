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
      apiVersion: "2026-02-25.clover",
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
 * Get the Pro tier price ID (LEGACY — backward compat)
 * New code should use dynamic tier lookup via featureRegistry.getTierByName
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
