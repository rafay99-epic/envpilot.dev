"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Check, X, Minus } from "lucide-react";
import {
  SectionHeading,
  Stagger,
  StaggerItem,
  Reveal,
} from "@/components/marketing";
import { generateFeatureLines } from "@/lib/pricing";

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

function formatFeatureValue(
  value: boolean | number | null,
  valueType: "boolean" | "numeric"
): React.ReactNode {
  if (valueType === "boolean") {
    return value ? (
      <Check className="mx-auto h-3.5 w-3.5 text-green-400" />
    ) : (
      <X className="mx-auto h-3.5 w-3.5 text-zinc-600" />
    );
  }
  if (value === null) {
    return <span className="font-medium text-green-400">Unlimited</span>;
  }
  return <span className="text-zinc-300">{value.toLocaleString()}</span>;
}

// ============================================================
// Pricing Card
// ============================================================

function PricingCard({ tier }: { tier: Tier }) {
  const isComingSoon = tier.isComingSoon;
  const isDefault = tier.isDefault;
  const price = tier.monthlyPrice ?? 0;
  const highlights =
    tier.highlightFeatures.length > 0
      ? tier.highlightFeatures
      : generateFeatureLines(tier.features);
  const cta =
    tier.ctaText ||
    (isComingSoon ? "Coming Soon" : isDefault ? "Get Started Free" : "Upgrade");
  const ctaHref = tier.ctaLink || "/sign-up";
  const emphasized = isDefault && !isComingSoon;

  const badgeColorClass =
    tier.badgeColor === "amber"
      ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
      : tier.badgeColor === "green"
        ? "border-green-500/20 bg-green-500/5 text-green-400"
        : "border-zinc-700 bg-zinc-800/50 text-zinc-500";
  const dotColorClass =
    tier.badgeColor === "amber"
      ? "bg-amber-400"
      : tier.badgeColor === "green"
        ? "bg-green-400"
        : "bg-zinc-500";

  return (
    <div
      className={`relative w-full rounded-2xl p-px transition-shadow duration-300 ${
        emphasized
          ? "bg-gradient-to-b from-green-500/50 via-zinc-700/40 to-zinc-800/40 shadow-[0_0_60px_-16px_rgba(34,197,94,0.35)]"
          : "bg-zinc-800/60"
      }`}
    >
      <div className="flex h-full flex-col rounded-[15px] bg-zinc-950/95 p-7">
        {/* Tier name + badge */}
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            {tier.name}
          </span>
          <div className="flex items-center gap-2">
            {isComingSoon && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/50 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-500" />
                coming soon
              </span>
            )}
            {tier.badge && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${badgeColorClass}`}
              >
                <span className={`h-1 w-1 rounded-full ${dotColorClass}`} />
                {tier.badge}
              </span>
            )}
          </div>
        </div>

        {/* Display name */}
        <h3
          className={`mt-4 font-sans text-lg font-bold tracking-tight ${
            isComingSoon ? "text-zinc-400" : "text-zinc-100"
          }`}
        >
          {tier.displayName}
        </h3>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={`font-sans text-5xl font-bold tracking-tight ${
              isComingSoon ? "text-zinc-400" : "text-zinc-100"
            }`}
          >
            ${price}
          </span>
          <span className="font-mono text-xs text-zinc-600">
            / month / organization
          </span>
        </div>

        {/* What's included */}
        <p className="mt-7 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {"// what's included"}
        </p>
        <div className="mt-3 space-y-2.5">
          {highlights.map((item) => (
            <p
              key={item}
              className={`flex items-start gap-2.5 font-mono text-xs ${
                isComingSoon ? "text-zinc-600" : "text-zinc-400"
              }`}
            >
              <Check
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  isComingSoon ? "text-zinc-700" : "text-green-400"
                }`}
              />
              {item}
            </p>
          ))}
        </div>

        <div className="mt-8 flex-1" />

        {/* CTA */}
        {isComingSoon ? (
          <span className="block cursor-not-allowed rounded-lg border border-zinc-800 px-5 py-3 text-center font-mono text-xs text-zinc-600">
            {cta}
          </span>
        ) : (
          <Link
            href={ctaHref}
            className={`block rounded-lg px-5 py-3 text-center font-mono text-xs font-semibold transition-all ${
              emphasized
                ? "bg-green-500 text-zinc-950 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] hover:shadow-[0_0_55px_-8px_rgba(34,197,94,0.8)]"
                : "border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
            }`}
          >
            {cta}
          </Link>
        )}
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
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th className="w-1/3 px-5 py-4 font-medium uppercase tracking-widest text-zinc-500">
                Feature
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier.name}
                  className="px-4 py-4 text-center font-sans text-sm font-bold tracking-tight text-zinc-100"
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
                  <tr className="border-b border-zinc-800/50 bg-green-500/[0.03]">
                    <td
                      colSpan={tiers.length + 1}
                      className="px-5 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-green-400"
                    >
                      {`// ${category}`}
                    </td>
                  </tr>
                  {visibleFeatures.map((feature) => (
                    <tr
                      key={feature.key}
                      className="border-b border-zinc-800/50 transition-colors last:border-b-0 hover:bg-green-500/[0.04]"
                    >
                      <td className="px-5 py-3 text-zinc-400">
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
                              className="px-4 py-3 text-center"
                            >
                              <Minus className="mx-auto h-3.5 w-3.5 text-zinc-700" />
                            </td>
                          );
                        }
                        return (
                          <td key={tier.name} className="px-4 py-3 text-center">
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
    </div>
  );
}

// ============================================================
// Main Pricing Content (client component for interactivity)
// ============================================================

export function PricingContent({
  pricingData: serverPricingData,
  paymentsEnabled: serverPaymentsEnabled,
}: {
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}) {
  // Client-side fallback: if server couldn't fetch (e.g. CI build), fetch on client
  const clientPricingData = useQuery(
    api.features.featureRegistry.queries.getPricingData,
    serverPricingData ? "skip" : undefined
  );
  const clientPaymentsEnabled = useQuery(
    api.features.billing.tierLimits.isPaymentsEnabled,
    serverPaymentsEnabled !== null ? "skip" : undefined
  );

  const pricingData = serverPricingData ?? (clientPricingData as PricingData);
  const paymentsEnabled =
    serverPaymentsEnabled ?? clientPaymentsEnabled ?? false;

  if (!pricingData) {
    // Still loading client-side
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-96 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40"
          />
        ))}
      </div>
    );
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
    <>
      {/* Pricing Cards */}
      <Stagger className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <StaggerItem key={tier.name} className="flex">
            <PricingCard tier={tier} />
          </StaggerItem>
        ))}
      </Stagger>

      {/* Feature Comparison */}
      <section className="mt-28">
        <SectionHeading
          eyebrow="details"
          title={
            <>
              Feature <span className="text-green-400">comparison</span>
            </>
          }
          description="A detailed breakdown of what's included in each plan."
        />
        <Reveal className="mt-10" delay={0.1}>
          <ComparisonTable
            tiers={tiers}
            allFeatures={allFeatures}
            categories={categories}
          />
        </Reveal>
      </section>
    </>
  );
}
