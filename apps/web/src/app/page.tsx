import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { PricingData } from "@/components/pricing/PricingContent";

export const revalidate = 300; // refresh pricing data every 5 minutes

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.envpilot.dev";

// Rich-result eligibility for "envpilot" queries: app category, platforms,
// and the free-tier offer.
const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Envpilot",
  url: baseUrl,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows, Web",
  description:
    "Stop pasting .env files into Slack. Envpilot keeps your team's environment variables in sync — CLI, VS Code extension, and web dashboard with role-based access control.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free plan — no credit card required",
  },
  publisher: { "@id": `${baseUrl}/#organization` },
};

export default async function HomePage() {
  let pricingData: PricingData | null = null;
  let paymentsEnabled: boolean | null = null;

  try {
    const [pricing, payments] = await Promise.all([
      convex.query(api.features.featureRegistry.queries.getPricingData),
      convex.query(api.features.billing.tierLimits.isPaymentsEnabled),
    ]);
    pricingData = pricing as PricingData;
    paymentsEnabled = payments ?? false;
  } catch {
    // Graceful fallback — the client island fetches via useQuery instead
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <LandingPage
        pricingData={pricingData}
        paymentsEnabled={paymentsEnabled}
      />
    </>
  );
}
