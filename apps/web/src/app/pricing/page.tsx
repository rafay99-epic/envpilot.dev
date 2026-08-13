import Link from "next/link";
import type { Metadata } from "next";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import {
  MarketingShell,
  PageHero,
  SectionHeading,
  TerminalFrame,
  GlowDivider,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/marketing";
import {
  PricingContent,
  type PricingData,
} from "@/components/pricing/PricingContent";

export const metadata: Metadata = {
  title: "Pricing | Envpilot",
  description:
    "Simple, transparent pricing for Envpilot. Start free with AES-256 encryption, RBAC, and real-time sync. Upgrade to Pro for unlimited resources.",
  alternates: { canonical: "/pricing" },
};

const FAQ_ITEMS = [
  {
    q: "Is the free plan really free?",
    a: "Yes. During our alpha period, the free plan includes CLI and VS Code Extension access at no cost. No credit card required.",
  },
  {
    q: "What happens when Pro launches?",
    a: "Your free plan stays free forever. Pro adds unlimited resources, version history, bulk import, granular permissions, and extended audit log retention.",
  },
  {
    q: "Can I change plans later?",
    a: "Absolutely. Upgrade or downgrade at any time. When downgrading, you get a 7-day grace period to adjust your usage.",
  },
  {
    q: "Is my data encrypted?",
    a: "Yes. All secret values are encrypted with AES-256 and stored in an isolated vault. Envpilot never stores plaintext secrets in the database.",
  },
  {
    q: "Do you offer team/enterprise pricing?",
    a: "Enterprise plans with SSO, custom branding, and dedicated support are on the roadmap. Contact us for early access.",
  },
];

// FAQ rich results for the pricing page, generated from the same data the
// page renders.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default async function PricingPage() {
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
    // Graceful fallback — client component will fetch via useQuery
  }

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* Hero */}
      <PageHero
        eyebrow="pricing"
        title={
          <>
            Simple, <span className="text-accent">transparent</span> pricing
          </>
        }
        description="Start free. Upgrade when you need more power. Every plan includes AES-256 encryption, role-based access control, and real-time sync across CLI, VS Code, and web dashboard."
      />

      {/* Pricing cards + feature comparison (client island) */}
      <section className="relative pb-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <PricingContent
            pricingData={pricingData as PricingData}
            paymentsEnabled={paymentsEnabled ?? false}
          />
        </div>
      </section>

      <GlowDivider />

      {/* FAQ */}
      <section className="relative py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="faq"
            title={
              <>
                Frequently asked <span className="text-accent">questions</span>
              </>
            }
            description="Everything you need to know before getting started."
          />
          <Stagger className="mt-10 space-y-4">
            {FAQ_ITEMS.map(({ q, a }) => (
              <StaggerItem key={q}>
                <div className="rounded-xl border border-line bg-surface/40 p-6 transition-colors duration-300 hover:border-accent-line">
                  <h3 className="flex items-start gap-2.5 font-sans text-sm font-bold tracking-tight text-ink">
                    <span aria-hidden className="font-mono text-accent">
                      ❯
                    </span>
                    {q}
                  </h3>
                  <p className="mt-2.5 pl-6 font-mono text-xs leading-relaxed text-ink-subtle">
                    {a}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <GlowDivider />

      {/* Final CTA */}
      <section className="relative py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <SectionHeading
            eyebrow="get started"
            title={
              <>
                Ship secrets <span className="text-accent">safely</span> today
              </>
            }
            description="Get started in under 2 minutes. No credit card required."
            align="center"
            className="items-center"
          />
          <Reveal className="mx-auto mt-10 max-w-xl" delay={0.1}>
            <TerminalFrame title="bash — get started" glow>
              <div className="text-left">
                <p className="text-xs text-ink-muted">
                  <span aria-hidden className="text-accent">
                    ❯{" "}
                  </span>
                  <span className="text-accent">npx</span> @envpilot/cli init
                </p>
                <p className="mt-2 text-[11px] text-ink-faint">
                  # encrypted vault, RBAC, and real-time sync in one command
                </p>
              </div>
            </TerminalFrame>
          </Reveal>
          <Reveal className="mt-8" delay={0.2}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="rounded-lg bg-accent px-6 py-3 font-mono text-xs font-semibold text-ink-inverse shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] transition-shadow hover:shadow-[0_0_55px_-8px_rgba(34,197,94,0.8)]"
              >
                Get Started Free
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-line px-6 py-3 font-mono text-xs text-ink-muted transition-colors hover:border-accent-line hover:text-accent"
              >
                Read the docs
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
