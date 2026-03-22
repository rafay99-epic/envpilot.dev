"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Check, X, Minus } from "lucide-react";

// ============================================================
// Helpers — generate feature lines from resolved data as fallback
// ============================================================

function generateFeatureLines(
  features: Array<{
    key: string;
    displayName: string;
    valueType: string;
    value: boolean | number | null;
  }>
): string[] {
  const lines: string[] = [];
  for (const f of features) {
    if (f.valueType === "numeric") {
      if (f.value === null)
        lines.push(
          `Unlimited ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
      else if (typeof f.value === "number")
        lines.push(
          `${f.value} ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
    } else if (f.valueType === "boolean" && f.value === true) {
      lines.push(f.displayName);
    }
  }
  return lines.slice(0, 8);
}

function formatFeatureValue(
  value: boolean | number | null,
  valueType: "boolean" | "numeric"
): React.ReactNode {
  if (valueType === "boolean") {
    return value ? (
      <Check className="mx-auto h-3 w-3 text-green-400" />
    ) : (
      <X className="mx-auto h-3 w-3 text-zinc-600" />
    );
  }
  if (value === null) {
    return <span className="text-green-400 font-medium">Unlimited</span>;
  }
  return <span className="text-zinc-300">{value.toLocaleString()}</span>;
}

// ============================================================
// Terminal Window — exact match with landing page
// ============================================================

function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <span className="h-3 w-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-zinc-500">{title}</span>
      </div>
      <div className="flex-1 p-5 font-mono text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Feature Comparison Table
// ============================================================

function ComparisonTable({
  tiers,
  allFeatures,
  categories,
}: {
  tiers: Array<{
    name: string;
    displayName: string;
    features: Array<{
      key: string;
      displayName: string;
      description?: string;
      valueType: "boolean" | "numeric";
      category: string;
      value: boolean | number | null;
    }>;
  }>;
  allFeatures: Array<{
    key: string;
    displayName: string;
    description?: string;
    valueType: "boolean" | "numeric";
    category: string;
  }>;
  categories: string[];
}) {
  const tierFeatureMap = new Map<
    string,
    Map<
      string,
      { value: boolean | number | null; valueType: "boolean" | "numeric" }
    >
  >();
  for (const tier of tiers) {
    const fMap = new Map<
      string,
      { value: boolean | number | null; valueType: "boolean" | "numeric" }
    >();
    for (const f of tier.features) {
      fMap.set(f.key, { value: f.value, valueType: f.valueType });
    }
    tierFeatureMap.set(tier.name, fMap);
  }

  const featuresByCategory = new Map<string, typeof allFeatures>();
  for (const cat of categories) {
    featuresByCategory.set(
      cat,
      allFeatures.filter((f) => f.category === cat)
    );
  }

  const hiddenKeys = new Set(["sso_enabled"]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-700/50">
            <th className="py-3 pr-4 text-zinc-500 font-medium w-1/3">
              Feature
            </th>
            {tiers.map((tier) => (
              <th
                key={tier.name}
                className="py-3 px-4 text-center text-zinc-400 font-medium"
              >
                {tier.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const features = featuresByCategory.get(category) ?? [];
            const visibleFeatures = features.filter(
              (f) => !hiddenKeys.has(f.key)
            );
            if (visibleFeatures.length === 0) return null;

            return (
              <Fragment key={category}>
                <tr>
                  <td
                    colSpan={tiers.length + 1}
                    className="pt-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-green-500"
                  >
                    {category}
                  </td>
                </tr>
                {visibleFeatures.map((feature) => (
                  <tr key={feature.key} className="border-b border-zinc-800/50">
                    <td className="py-2.5 pr-4 text-zinc-400">
                      {feature.displayName}
                      {feature.description && (
                        <span className="block text-[10px] text-zinc-600 mt-0.5">
                          {feature.description}
                        </span>
                      )}
                    </td>
                    {tiers.map((tier) => {
                      const entry = tierFeatureMap
                        .get(tier.name)
                        ?.get(feature.key);
                      if (!entry) {
                        return (
                          <td
                            key={tier.name}
                            className="py-2.5 px-4 text-center"
                          >
                            <Minus className="mx-auto h-3 w-3 text-zinc-700" />
                          </td>
                        );
                      }
                      return (
                        <td key={tier.name} className="py-2.5 px-4 text-center">
                          {formatFeatureValue(entry.value, entry.valueType)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Loading Skeleton
// ============================================================

function PricingSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>
        </div>
      </header>
      <main className="pt-14">
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse" />
            <div className="mt-3 h-10 w-72 bg-zinc-800 rounded animate-pulse" />
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <div className="h-96 rounded-lg border border-zinc-700/50 bg-zinc-900/90 animate-pulse" />
              <div className="h-96 rounded-lg border border-zinc-700/50 bg-zinc-900/90 animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function PricingPage() {
  const pricingData = useQuery(api.featureRegistry.getPricingData);
  const paymentsEnabled = useQuery(api.tierLimits.isPaymentsEnabled);

  if (!pricingData) {
    return <PricingSkeleton />;
  }

  const { tiers: rawTiers, categories, allFeatures } = pricingData;

  // When payments are disabled via admin toggle, force paid tiers to show as "Coming Soon"
  const tiers = rawTiers.map((tier) => {
    if (!tier.isDefault && paymentsEnabled === false) {
      return { ...tier, isComingSoon: true };
    }
    return tier;
  });

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header — exact match with landing page */}
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
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-green-400"
            >
              sign-in
            </Link>
            <Link
              href="/sign-up"
              className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
            >
              get-started
            </Link>
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
            <p className="mt-4 max-w-xl text-xs text-zinc-500 leading-relaxed">
              Start free. Upgrade when you need more power. Every plan includes
              AES-256 encryption, role-based access control, and real-time sync
              across CLI, VS Code, and web dashboard.
            </p>

            {/* Pricing Cards */}
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {tiers.map((tier) => {
                const isComingSoon = tier.isComingSoon;
                const price = tier.monthlyPrice ?? 0;
                const badge = tier.badge;
                const badgeColor = tier.badgeColor;
                const highlights =
                  tier.highlightFeatures.length > 0
                    ? tier.highlightFeatures
                    : generateFeatureLines(tier.features);
                const cta =
                  tier.ctaText ||
                  (isComingSoon
                    ? "Coming Soon"
                    : tier.isDefault
                      ? "Get Started Free"
                      : "Upgrade");
                const ctaHref = tier.ctaLink || "/sign-up";

                const badgeColorClass =
                  badgeColor === "amber"
                    ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
                    : badgeColor === "green"
                      ? "border-green-500/20 bg-green-500/5 text-green-400"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-500";
                const dotColorClass =
                  badgeColor === "amber"
                    ? "bg-amber-400"
                    : badgeColor === "green"
                      ? "bg-green-400"
                      : "bg-zinc-500";

                return (
                  <TerminalWindow
                    key={tier.name}
                    title={`plan \u2014 ${tier.name}${isComingSoon ? " (coming soon)" : ""}`}
                    className="h-full"
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-bold ${
                          isComingSoon ? "text-zinc-400" : "text-green-400"
                        }`}
                      >
                        ${price}
                      </span>
                      <span className="text-xs text-zinc-600">
                        / month / organization
                      </span>
                    </div>
                    {badge && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] ${badgeColorClass}`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${dotColorClass}`}
                        />
                        {badge}
                      </div>
                    )}
                    <div className="mt-5 space-y-2 text-xs">
                      {highlights.map((item) => (
                        <p
                          key={item}
                          className={`flex items-center gap-2 ${
                            isComingSoon ? "text-zinc-500" : "text-zinc-400"
                          }`}
                        >
                          <Check
                            className={`h-3 w-3 shrink-0 ${
                              isComingSoon ? "text-zinc-600" : "text-green-400"
                            }`}
                          />
                          {item}
                        </p>
                      ))}
                    </div>
                    <div className="mt-6">
                      {isComingSoon ? (
                        <span className="block rounded border border-zinc-700 px-4 py-2.5 text-center text-xs text-zinc-600 cursor-not-allowed">
                          {cta}
                        </span>
                      ) : (
                        <Link
                          href={ctaHref}
                          className="block rounded border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-center text-xs text-green-400 transition-all hover:bg-green-500/20"
                        >
                          {cta}
                        </Link>
                      )}
                    </div>
                  </TerminalWindow>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feature Comparison */}
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// details"}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-100">
              Feature comparison
            </h2>
            <p className="mt-2 text-xs text-zinc-500">
              A detailed breakdown of what&apos;s included in each plan.
            </p>
            <div className="mt-8">
              <TerminalWindow title="feature-matrix">
                <ComparisonTable
                  tiers={tiers}
                  allFeatures={allFeatures}
                  categories={categories}
                />
              </TerminalWindow>
            </div>
          </div>
        </section>

        {/* FAQ */}
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
                  <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-800/50 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-5xl px-4 text-center">
            <TerminalWindow
              title="bash — get started"
              className="mx-auto inline-block"
            >
              <code className="text-xs text-green-400">
                npx @envpilot/cli init
              </code>
            </TerminalWindow>
            <p className="mt-6 text-xs text-zinc-500">
              Get started in under 2 minutes. No credit card required.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
