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
  variant?: "inline" | "modal" | "banner" | "card";
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

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-2 text-sm text-amber-400 ${className}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">{reason}</span>
        <button
          onClick={handleUpgradeClick}
          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-green-400 transition-colors hover:text-green-300"
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
        className={`rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10">
              <Sparkles className="h-5 w-5 text-green-400" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              {feature ? `Unlock ${feature}` : `Upgrade to ${upgradeName}`}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">{reason}</p>
            <button
              onClick={handleUpgradeClick}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
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
        className={`overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900 ${className}`}
      >
        <div className="border-b border-zinc-700/50 bg-zinc-800/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              Upgrade to {upgradeName}
            </h3>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-zinc-400">{reason}</p>
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
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                <Check className="h-4 w-4 shrink-0 text-green-400" />
                {item}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgradeClick}
            className="mt-6 w-full rounded-lg border border-green-500/30 bg-green-500/10 py-2 px-4 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
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
      <div className="relative w-full max-w-md mx-4 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-700/50 bg-zinc-800/50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10">
            <Sparkles className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100">
            {feature ? `Unlock ${feature}` : `Upgrade to ${upgradeName}`}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Get unlimited access to all features
          </p>
        </div>
        <div className="p-6">
          <p className="text-center text-sm text-zinc-400 mb-6">{reason}</p>
          <div className="flex gap-3">
            <button
              onClick={() => onUpgradeClick?.()}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2 px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Maybe Later
            </button>
            <button
              onClick={handleUpgradeClick}
              className="flex-1 rounded-lg border border-green-500/30 bg-green-500/10 py-2 px-4 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
