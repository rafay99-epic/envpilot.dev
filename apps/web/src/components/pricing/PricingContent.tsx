"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Check, X, Minus } from "lucide-react";

// ============================================================
// Types matching the Convex getPricingData return shape
// ============================================================

interface TierFeature {
  key: string;
  displayName: string;
  description?: string;
  valueType: "boolean" | "numeric";
  category: string;
  value: boolean | number | null;
}

interface Tier {
  name: string;
  displayName: string;
  isDefault: boolean;
  isComingSoon: boolean;
  monthlyPrice: number | null;
  badge: string | null;
  badgeColor: string | null;
  highlightFeatures: string[];
  ctaText: string | null;
  ctaLink: string | null;
  features: TierFeature[];
}

interface AllFeature {
  key: string;
  displayName: string;
  description?: string;
  valueType: "boolean" | "numeric";
  category: string;
}

export interface PricingData {
  tiers: Tier[];
  categories: string[];
  allFeatures: AllFeature[];
}

// ============================================================
// Helpers
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
    return <span className="font-medium text-green-400">Unlimited</span>;
  }
  return <span className="text-zinc-300">{value.toLocaleString()}</span>;
}

// ============================================================
// Terminal Window
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
  tiers: Tier[];
  allFeatures: AllFeature[];
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
            <th className="w-1/3 py-3 pr-4 font-medium text-zinc-500">
              Feature
            </th>
            {tiers.map((tier) => (
              <th
                key={tier.name}
                className="px-4 py-3 text-center font-medium text-zinc-400"
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
                    className="pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-green-500"
                  >
                    {category}
                  </td>
                </tr>
                {visibleFeatures.map((feature) => (
                  <tr key={feature.key} className="border-b border-zinc-800/50">
                    <td className="py-2.5 pr-4 text-zinc-400">
                      {feature.displayName}
                      {feature.description && (
                        <span className="mt-0.5 block text-[10px] text-zinc-600">
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
                            className="px-4 py-2.5 text-center"
                          >
                            <Minus className="mx-auto h-3 w-3 text-zinc-700" />
                          </td>
                        );
                      }
                      return (
                        <td key={tier.name} className="px-4 py-2.5 text-center">
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
// Main Pricing Content (client component for interactivity)
// ============================================================

export function PricingContent({
  pricingData,
  paymentsEnabled,
}: {
  pricingData: PricingData;
  paymentsEnabled: boolean;
}) {
  const { tiers: rawTiers, categories, allFeatures } = pricingData;

  // When payments are disabled via admin toggle, force paid tiers to show as "Coming Soon"
  const tiers = rawTiers.map((tier) => {
    if (!tier.isDefault && paymentsEnabled === false) {
      return { ...tier, isComingSoon: true };
    }
    return tier;
  });

  return (
    <>
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
                  <span className={`h-1 w-1 rounded-full ${dotColorClass}`} />
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
                  <span className="block cursor-not-allowed rounded border border-zinc-700 px-4 py-2.5 text-center text-xs text-zinc-600">
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

      {/* Feature Comparison */}
      <section className="mt-24 border-t border-zinc-800/50 pt-24">
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
      </section>
    </>
  );
}
