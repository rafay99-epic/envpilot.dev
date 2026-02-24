"use client";

import { ReactNode } from "react";
import { useTierLimitCheck, Tier, TierAction } from "@/hooks/useTierLimits";
import { UpgradePrompt } from "./UpgradePrompt";
import { Id } from "../../../convex/_generated/dataModel";

interface FeatureGateProps {
  /**
   * Organization ID to check tier for
   */
  organizationId: Id<"organizations"> | undefined;
  /**
   * The action/feature to check
   */
  action: TierAction;
  /**
   * Optional project ID (required for create_variable)
   */
  projectId?: Id<"projects">;
  /**
   * Content to render when allowed
   */
  children: ReactNode;
  /**
   * Content to render when not allowed (default: UpgradePrompt)
   */
  fallback?: ReactNode;
  /**
   * Feature name for the upgrade prompt
   */
  featureName?: string;
  /**
   * How to display the fallback
   */
  fallbackVariant?: "inline" | "banner" | "card" | "hide";
  /**
   * Current tier for the upgrade prompt
   */
  currentTier?: Tier;
}

/**
 * Component that gates features based on tier limits
 * Renders children if allowed, fallback if not
 */
export function FeatureGate({
  organizationId,
  action,
  projectId,
  children,
  fallback,
  featureName,
  fallbackVariant = "inline",
  currentTier = "free",
}: FeatureGateProps) {
  const { isLoading, allowed, reason } = useTierLimitCheck(
    organizationId,
    action,
    projectId
  );

  // While loading, don't render anything or show a subtle loader
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-24" />
      </div>
    );
  }

  // If allowed, render children
  if (allowed) {
    return <>{children}</>;
  }

  // If fallbackVariant is "hide", don't render anything
  if (fallbackVariant === "hide") {
    return null;
  }

  // If custom fallback provided, use it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Otherwise render the default UpgradePrompt
  return (
    <UpgradePrompt
      reason={reason || "This feature requires an upgrade."}
      feature={featureName}
      currentTier={currentTier}
      variant={fallbackVariant === "inline" ? "inline" : fallbackVariant === "banner" ? "banner" : "card"}
    />
  );
}

interface ProOnlyBadgeProps {
  /**
   * Display size
   */
  size?: "sm" | "md";
  /**
   * Show tooltip on hover
   */
  showTooltip?: boolean;
  /**
   * Tooltip text
   */
  tooltipText?: string;
}

/**
 * Badge indicating a feature is Pro-only
 */
export function ProOnlyBadge({
  size = "sm",
  showTooltip = true,
  tooltipText = "Pro feature",
}: ProOnlyBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white ${sizeClasses[size]}`}
      title={showTooltip ? tooltipText : undefined}
    >
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
          clipRule="evenodd"
        />
      </svg>
      Pro
    </span>
  );
}

interface LimitWarningProps {
  /**
   * Current usage count
   */
  current: number;
  /**
   * Maximum limit
   */
  limit: number | null;
  /**
   * Resource name (e.g., "projects", "variables")
   */
  resourceName: string;
  /**
   * Threshold percentage to start showing warning (default: 80)
   */
  warningThreshold?: number;
}

/**
 * Warning component that shows when approaching limits
 */
export function LimitWarning({
  current,
  limit,
  resourceName,
  warningThreshold = 80,
}: LimitWarningProps) {
  if (limit === null) return null;

  const percentage = (current / limit) * 100;

  if (percentage < warningThreshold) return null;

  const remaining = limit - current;
  const isAtLimit = remaining <= 0;

  if (isAtLimit) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span>
          You&apos;ve reached the {resourceName} limit ({current}/{limit}).
          <button className="ml-1 text-purple-600 dark:text-purple-400 hover:underline font-medium">
            Upgrade to Pro
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        You have {remaining} {resourceName} remaining ({current}/{limit}).
      </span>
    </div>
  );
}
