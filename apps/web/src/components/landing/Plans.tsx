"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Check } from "lucide-react";
import type { PricingData } from "@/components/pricing/PricingContent";
import { TerminalCommand, terminal } from "@/components/marketing";
import { generateFeatureLines } from "@/lib/pricing";

function PricingCards({
  pricingData: serverPricingData,
  paymentsEnabled: serverPaymentsEnabled,
}: {
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}) {
  const clientPricingData = useQuery(
    api.features.featureRegistry.queries.getPricingData,
    serverPricingData ? "skip" : {}
  );
  const clientPaymentsEnabled = useQuery(
    api.features.billing.tierLimits.isPaymentsEnabled,
    serverPaymentsEnabled !== null ? "skip" : {}
  );
  const pricingData =
    serverPricingData ?? (clientPricingData as PricingData | undefined);
  const paymentsEnabled =
    serverPaymentsEnabled ?? clientPaymentsEnabled ?? false;

  if (!pricingData) {
    return (
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`${terminal.panel} h-96 animate-pulse`} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2">
      {pricingData.tiers.map((tier) => {
        const isComingSoon =
          tier.isComingSoon || (!tier.isDefault && paymentsEnabled === false);
        const isDefault = tier.isDefault;
        const price = tier.monthlyPrice ?? 0;
        const highlights =
          tier.highlightFeatures.length > 0
            ? tier.highlightFeatures
            : generateFeatureLines(tier.features);
        const cta =
          tier.ctaText ||
          (isComingSoon
            ? "Coming Soon"
            : isDefault
              ? "Get Started Free"
              : "Upgrade");
        const ctaHref = tier.ctaLink || "/sign-up";

        return (
          <div
            key={tier.name}
            className={`${terminal.panel} flex flex-col p-7`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`${terminal.mono} text-[11px] tracking-[0.16em] text-accent uppercase`}
              >
                {tier.name}
              </span>
              {tier.badge && (
                <span className={`${terminal.mono} text-[11px] text-ink-faint`}>
                  {tier.badge}
                </span>
              )}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
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
              {highlights.map((item: string) => (
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
      })}
    </div>
  );
}

export function Plans({
  pricingData,
  paymentsEnabled,
}: {
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}) {
  return (
    <section id="pricing" className="scroll-mt-24 py-24 sm:py-28">
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot plans"
          comment="adding a teammate shouldn't be a budget conversation."
        />
        <PricingCards
          pricingData={pricingData}
          paymentsEnabled={paymentsEnabled}
        />
        <Link
          href="/pricing"
          className={`mt-6 inline-block ${terminal.mono} text-[13px] text-ink-subtle transition-colors hover:text-accent`}
        >
          → compare every feature
        </Link>
      </div>
    </section>
  );
}
