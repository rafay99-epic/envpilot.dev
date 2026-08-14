import { Polar } from "@polar-sh/sdk";

/**
 * Polar.sh Client Configuration
 *
 * Provides a configured Polar client for server-side payment operations.
 * The payment system can be enabled/disabled via environment variables.
 */

// Check if payments are enabled
export const isPaymentsEnabled = () => {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
};

// Validate Polar configuration
const validatePolarConfig = () => {
  if (!isPaymentsEnabled()) {
    return { valid: false, reason: "Payments are disabled" };
  }

  if (!process.env.POLAR_ACCESS_TOKEN) {
    return { valid: false, reason: "POLAR_ACCESS_TOKEN is not configured" };
  }

  if (!process.env.POLAR_WEBHOOK_SECRET) {
    return { valid: false, reason: "POLAR_WEBHOOK_SECRET is not configured" };
  }

  return { valid: true, reason: null };
};

// Lazy-initialized Polar client
let polarClient: Polar | null = null;

/**
 * Get the Polar client instance
 * Returns null if payments are disabled or not configured
 */
export const getPolarClient = (): Polar | null => {
  if (!isPaymentsEnabled()) {
    return null;
  }

  if (!process.env.POLAR_ACCESS_TOKEN) {
    return null;
  }

  if (!polarClient) {
    polarClient = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN,
      server:
        (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
    });
  }

  return polarClient;
};

/**
 * Get the Polar webhook secret
 */
export const getPolarWebhookSecret = (): string | null => {
  if (!isPaymentsEnabled()) {
    return null;
  }
  return process.env.POLAR_WEBHOOK_SECRET || null;
};
