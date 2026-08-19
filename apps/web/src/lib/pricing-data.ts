import { cacheLife } from "next/cache";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { PricingData } from "@/components/pricing/PricingContent";

/**
 * Plan data for the landing and pricing pages.
 *
 * Prices change on the order of months, so this is prerendered rather than
 * fetched per request — it is what keeps both routes out of a Convex round
 * trip on first paint. The client island re-subscribes on mount, so a plan
 * change still shows up without waiting for the cache to roll over.
 */
export async function getPricing(): Promise<{
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}> {
  "use cache";
  cacheLife("hours");

  try {
    const [pricing, payments] = await Promise.all([
      convex.query(api.features.featureRegistry.queries.getPricingData),
      convex.query(api.features.billing.tierLimits.isPaymentsEnabled),
    ]);
    return {
      pricingData: pricing as PricingData,
      paymentsEnabled: payments ?? false,
    };
  } catch {
    // Graceful fallback — the client island fetches via useQuery instead
    return { pricingData: null, paymentsEnabled: null };
  }
}
