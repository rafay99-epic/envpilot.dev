"use client";

import type { Tier } from "@/hooks/useTierLimits";
import { usePaymentsEnabled } from "@/hooks/usePaymentsEnabled";
import { Sparkles, ArrowRight, Check } from "lucide-react";

interface UpgradePromptProps {
  /**
   * The reason why the user needs to upgrade
   */
  reason: string;
  /**
   * The feature that triggered the upgrade prompt
   */
  feature?: string;
  /**
   * Current tier of the organization
   */
  currentTier: Tier;
  /**
   * Target tier name to upgrade to (dynamic — defaults to "Pro")
   */
  targetTierName?: string;
  /**
   * Optional callback when user clicks upgrade
   */
  onUpgradeClick?: () => void;
  /**
   * Display variant
   */
  variant?: "inline" | "modal" | "banner" | "card" | "line";
  /**
   * Optional className for additional styling
   */
  className?: string;
}

/**
 * Component to prompt users to upgrade their subscription tier.
 * Supports dynamic tier names — shows the target tier name instead
 * of hardcoded "Pro".
 */
export function UpgradePrompt({
  reason,
  feature,
  currentTier,
  targetTierName,
  onUpgradeClick,
  variant = "inline",
  className = "",
}: UpgradePromptProps) {
  const paymentsEnabled = usePaymentsEnabled();
  const upgradeName = targetTierName ?? "Pro";

  // Don't show upgrade UI when payments are disabled
  if (!paymentsEnabled) return null;

  const handleUpgradeClick = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      window.location.href = "/api/checkout?tier=pro";
    }
  };

  // Settings run on the "one border level" rule — only controls carry a
  // border there, so the gate is a line of text, not a box.
  if (variant === "line") {
    return (
      <div
        className={`flex flex-wrap items-center gap-2 text-sm text-ink-muted ${className}`}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="flex-1">{reason}</span>
        <button
          onClick={handleUpgradeClick}
          className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-accent transition-colors hover:text-accent-hover"
        >
          Upgrade to {upgradeName}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning ${className}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">{reason}</span>
        <button
          onClick={handleUpgradeClick}
          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent transition-colors hover:text-accent"
        >
          Upgrade to {upgradeName}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={`rounded-lg border border-line bg-surface/90 p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-accent-line bg-accent-soft">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink">
              {feature ? `Unlock ${feature}` : `Upgrade to ${upgradeName}`}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">{reason}</p>
            <button
              onClick={handleUpgradeClick}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-all hover:border-accent-line hover:bg-accent-soft"
            >
              Upgrade to {upgradeName}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={`overflow-hidden rounded-xl border border-line bg-surface ${className}`}
      >
        <div className="border-b border-line bg-surface-raised/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h3 className="text-base font-semibold text-ink">
              Upgrade to {upgradeName}
            </h3>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-ink-muted">{reason}</p>
          <ul className="mt-4 space-y-2">
            {[
              "Unlimited projects",
              "Unlimited variables",
              "Unlimited team members",
              "Version history & rollback",
              "365-day audit retention",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-ink-muted"
              >
                <Check className="h-4 w-4 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgradeClick}
            className="mt-6 w-full rounded-lg border border-accent-line bg-accent-soft py-2 px-4 text-sm font-medium text-accent transition-all hover:border-accent-line hover:bg-accent-soft"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  // Modal variant
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onUpgradeClick?.()}
      />
      <div className="relative w-full max-w-md mx-4 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="border-b border-line bg-surface-raised/50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-accent-line bg-accent-soft">
            <Sparkles className="h-8 w-8 text-accent" />
          </div>
          <h2 className="text-xl font-bold text-ink">
            {feature ? `Unlock ${feature}` : `Upgrade to ${upgradeName}`}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Get unlimited access to all features
          </p>
        </div>
        <div className="p-6">
          <p className="text-center text-sm text-ink-muted mb-6">{reason}</p>
          <div className="flex gap-3">
            <button
              onClick={() => onUpgradeClick?.()}
              className="flex-1 rounded-lg border border-line bg-surface-raised py-2 px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover"
            >
              Maybe Later
            </button>
            <button
              onClick={handleUpgradeClick}
              className="flex-1 rounded-lg border border-accent-line bg-accent-soft py-2 px-4 text-sm font-medium text-accent transition-all hover:border-accent-line hover:bg-accent-soft"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
