"use client";

import { useUserTier } from "@/hooks/useFeatureGate";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

interface GracePeriodBannerProps {
  userId: Id<"users">;
  onRenewClick?: () => void;
}

/**
 * Banner shown when a user's subscription has expired but they are
 * still in the grace period. After the grace period ends, they will
 * be downgraded to the free tier.
 */
export function GracePeriodBanner({
  userId,
  onRenewClick,
}: GracePeriodBannerProps) {
  const { graceActive, gracePeriodEnd, tier } = useUserTier(userId);

  if (!graceActive || !gracePeriodEnd) return null;

  const daysLeft = Math.max(
    0,
    Math.ceil((gracePeriodEnd - Date.now()) / (1000 * 60 * 60 * 24))
  );

  const handleRenew = () => {
    if (onRenewClick) {
      onRenewClick();
    } else {
      window.open("/pricing", "_blank");
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-600/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Your <span className="font-medium">{tier}</span> plan has expired. You
        have{" "}
        <span className="font-semibold">
          {daysLeft} {daysLeft === 1 ? "day" : "days"}
        </span>{" "}
        to renew before being downgraded to the free plan.
      </span>
      <button
        onClick={handleRenew}
        className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-green-400 transition-colors hover:text-green-300"
      >
        Renew
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
