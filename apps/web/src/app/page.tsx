import { jsonLdScript } from "@envpilot/ui";
import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { getPricing } from "@/lib/pricing-data";
import { FAQ_ITEMS } from "@/components/landing/faq-data";

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
    "Stop pasting .env files into Slack. Envpilot securely connects environment variables to CLI, VS Code, GitHub Actions, REST API and MCP clients, with secret-safe Slack and Discord notifications.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free plan — no credit card required",
  },
  publisher: { "@id": `${baseUrl}/#organization` },
};

// Rich-result eligibility for the questions buyers actually search — content
// is shared with the visible landing FAQ section so the two never drift.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default async function HomePage() {
  const { pricingData, paymentsEnabled } = await getPricing();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema) }}
      />
      <LandingPage
        pricingData={pricingData}
        paymentsEnabled={paymentsEnabled}
      />
    </>
  );
}
