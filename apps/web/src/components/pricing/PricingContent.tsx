"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Check, X, Minus } from "lucide-react";
import {
  TerminalCommand,
  TerminalPanel,
  terminal,
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
      <Check className="mx-auto h-3.5 w-3.5 text-accent" />
    ) : (
      <X className="mx-auto h-3.5 w-3.5 text-ink-faint" />
    );
  }
  if (value === null) {
    return <span className="font-medium text-accent">Unlimited</span>;
  }
  return <span className="text-ink-muted">{value.toLocaleString()}</span>;
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

  const badgeColorClass =
    tier.badgeColor === "amber"
      ? "text-warning"
      : tier.badgeColor === "green"
        ? "text-accent"
        : "text-ink-faint";

  return (
    <div className={`${terminal.panel} flex h-full flex-col p-7`}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={`${terminal.mono} text-[11px] tracking-[0.16em] text-accent uppercase`}
        >
          {tier.name}
        </span>
        <div className={`flex items-center gap-3 ${terminal.mono} text-[11px]`}>
          {isComingSoon && <span className="text-ink-faint">coming soon</span>}
          {tier.badge && <span className={badgeColorClass}>{tier.badge}</span>}
        </div>
      </div>

      <h3
        className={`mt-5 font-sans text-[17px] font-semibold tracking-tight ${
          isComingSoon ? "text-ink-muted" : "text-ink"
        }`}
      >
        {tier.displayName}
      </h3>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`font-sans text-5xl font-semibold tracking-[-0.035em] ${
            isComingSoon ? "text-ink-subtle" : "text-ink"
          }`}
        >
          ${price}
        </span>
        <span className={`${terminal.mono} text-[12px] text-ink-faint`}>
          /mo · per org, not per seat
        </span>
      </div>

      <div className="mt-7 space-y-2.5">
        {highlights.map((item) => (
          <p
            key={item}
            className={`flex items-start gap-2.5 font-sans text-[15px] ${
              isComingSoon ? "text-ink-subtle" : "text-ink-muted"
            }`}
          >
            <Check
              aria-hidden
              className={`mt-1 h-3.5 w-3.5 shrink-0 ${
                isComingSoon ? "text-ink-faint" : "text-accent"
              }`}
            />
            {item}
          </p>
        ))}
      </div>

      <div className="mt-8 flex-1" />

      {isComingSoon ? (
        <span className="block cursor-not-allowed rounded-md px-5 py-3 text-center font-sans text-[15px] text-ink-subtle ring-1 ring-line">
          {cta}
        </span>
      ) : (
        <Link
          href={ctaHref}
          className={`block rounded-md px-5 py-3 text-center font-sans text-[15px] font-semibold transition-colors ${
            isDefault
              ? "bg-accent text-chrome hover:bg-accent-hover"
              : "text-ink ring-1 ring-line hover:ring-line-strong"
          }`}
        >
          {cta}
        </Link>
      )}
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
      <table
        className={`w-full text-left ${terminal.mono} text-[12px] sm:text-[13px]`}
      >
        <thead>
          <tr className={`border-b ${terminal.line}`}>
            <th className="w-1/2 px-3 py-3 text-[11px] tracking-[0.14em] text-ink-faint uppercase sm:px-5">
              feature
            </th>
            {tiers.map((tier) => (
              <th
                key={tier.name}
                className="px-2 py-3 text-center text-[11px] tracking-[0.14em] text-ink-muted uppercase sm:px-4"
              >
                {tier.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
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
                    className="px-3 pt-6 pb-2 text-[11px] tracking-[0.14em] text-accent uppercase sm:px-5"
                  >
                    # {category}
                  </td>
                </tr>
                {visibleFeatures.map((feature) => (
                  <tr key={feature.key}>
                    <td className="px-3 py-3 text-ink-muted sm:px-5">
                      {feature.displayName}
                      {feature.description && (
                        <span className="mt-0.5 block text-[11px] text-ink-faint">
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
                            className="px-2 py-3 text-center sm:px-4"
                          >
                            <Minus className="mx-auto h-3.5 w-3.5 text-ink-faint" />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={tier.name}
                          className="px-2 py-3 text-center sm:px-4"
                        >
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
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`${terminal.panel} h-96 animate-pulse`} />
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
      <div className="grid gap-4 md:grid-cols-2">
        {tiers.map((tier) => (
          <PricingCard key={tier.name} tier={tier} />
        ))}
      </div>

      <section className="mt-24">
        <TerminalCommand
          cmd="envpilot plans --compare"
          comment="every gate in the registry, per tier — including the ones free wins."
        />
        <div className="mt-10">
          <TerminalPanel
            title="tierFeatures — free vs pro"
            meta={`${allFeatures.length} features`}
            bodyClassName="p-0"
          >
            <ComparisonTable
              tiers={tiers}
              allFeatures={allFeatures}
              categories={categories}
            />
          </TerminalPanel>
        </div>
      </section>
    </>
  );
}
