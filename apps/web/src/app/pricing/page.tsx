import Link from "next/link";
import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { PublicHeaderButtons } from "@/components/landing/PublicHeaderButtons";
import {
  PricingContent,
  type PricingData,
} from "@/components/pricing/PricingContent";

export const metadata: Metadata = {
  title: "Pricing | Envpilot",
  description:
    "Simple, transparent pricing for Envpilot. Start free with AES-256 encryption, RBAC, and real-time sync. Upgrade to Pro for unlimited resources.",
};

export default async function PricingPage() {
  let pricingData: PricingData | null = null;
  let paymentsEnabled: boolean | null = null;

  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const [pricing, payments] = await Promise.all([
      convex.query(api.featureRegistry.getPricingData),
      convex.query(api.tierLimits.isPaymentsEnabled),
    ]);
    pricingData = pricing as PricingData;
    paymentsEnabled = payments ?? false;
  } catch {
    // Graceful fallback — client component will fetch via useQuery
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header — server-rendered */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              { label: "Features", href: "/#features" },
              { label: "Workflow", href: "/#workflow" },
              { label: "Pricing", href: "/pricing" },
              { label: "Docs", href: "/docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`text-xs transition-colors hover:text-green-400 ${
                  item.label === "Pricing" ? "text-green-400" : "text-zinc-500"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <PublicHeaderButtons />
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Pricing Section */}
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// pricing"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-zinc-500">
              Start free. Upgrade when you need more power. Every plan includes
              AES-256 encryption, role-based access control, and real-time sync
              across CLI, VS Code, and web dashboard.
            </p>

            {/* Client island for pricing cards + comparison table */}
            <PricingContent
              pricingData={pricingData as PricingData}
              paymentsEnabled={paymentsEnabled ?? false}
            />
          </div>
        </section>

        {/* FAQ — fully server-rendered, no interactivity */}
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// faq"}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-100">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-6">
              {[
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
              ].map(({ q, a }) => (
                <div key={q} className="border-b border-zinc-800/50 pb-5">
                  <h3 className="text-xs font-medium text-zinc-200">{q}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA — server-rendered */}
        <section className="border-t border-zinc-800/50 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-5xl px-4 text-center">
            <div className="mx-auto inline-block overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <span className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-xs text-zinc-500">
                  bash — get started
                </span>
              </div>
              <div className="p-5 font-mono text-sm leading-relaxed">
                <code className="text-xs text-green-400">
                  npx @envpilot/cli init
                </code>
              </div>
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              Get started in under 2 minutes. No credit card required.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
