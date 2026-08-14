import Link from "next/link";
import type { Metadata } from "next";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import {
  MarketingShell,
  PageHero,
  SITE_URLS,
  TerminalCommand,
  TerminalPanel,
  terminal,
} from "@/components/marketing";
import {
  PricingContent,
  type PricingData,
} from "@/components/pricing/PricingContent";
import { jsonLd } from "@/lib/json-ld";

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
        dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }}
      />
      <PageHero
        eyebrow="pricing"
        title={
          <>
            Priced per org, <span className="text-accent">not per seat</span>.
          </>
        }
        description="Start free. Upgrade when you need more. Every plan carries AES-256 encryption, role-based access control, and real-time sync across CLI, editor, CI, and API."
      />

      <section className="pb-24">
        <div className={terminal.shell}>
          <PricingContent
            pricingData={pricingData as PricingData}
            paymentsEnabled={paymentsEnabled ?? false}
          />
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className={terminal.shell}>
          <TerminalCommand
            cmd="envpilot help billing"
            comment="the questions people send before they put a card in."
          />

          <div
            className={`mt-12 divide-y divide-line border-y ${terminal.line}`}
          >
            {FAQ_ITEMS.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[16px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    aria-hidden
                    className={`${terminal.mono} text-ink-faint transition-transform group-open:rotate-45`}
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl font-sans text-[16px] leading-relaxed text-ink-muted">
                  {a}
                </p>
              </details>
            ))}
          </div>
          <Link
            href="/faq"
            className={`mt-6 inline-block ${terminal.mono} text-[13px] text-ink-subtle transition-colors hover:text-accent`}
          >
            → every other question
          </Link>
        </div>
      </section>

      <section className="pb-24">
        <div className={terminal.shell}>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="max-w-md font-sans text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-ink">
                Two minutes to your first encrypted variable.
              </h2>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Link href="/sign-up" className={terminal.cta}>
                  Start free
                </Link>
                <Link href={SITE_URLS.docs} className={terminal.ctaGhost}>
                  Read the docs
                </Link>
              </div>
              <p className={`mt-6 ${terminal.mono} text-[12px] text-ink-faint`}>
                free plan · no card · MIT licensed · self-host any time
              </p>
            </div>

            <TerminalPanel title="bash — get started">
              <div className={`${terminal.mono} text-[13px] leading-[1.95]`}>
                <p className="text-ink">
                  <span aria-hidden className="mr-2 text-accent">
                    ❯
                  </span>
                  npx @envpilot/cli init
                </p>
                <p className="text-ink-faint">
                  # encrypted vault, RBAC and real-time sync in one command
                </p>
              </div>
            </TerminalPanel>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
