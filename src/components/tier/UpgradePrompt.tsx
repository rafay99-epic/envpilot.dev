"use client";

import { Tier } from "@/hooks/useTierLimits";

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
 * Component to prompt users to upgrade their subscription tier
 */
export function UpgradePrompt({
  reason,
  feature,
  currentTier,
  onUpgradeClick,
  variant = "inline",
  className = "",
}: UpgradePromptProps) {
  const handleUpgradeClick = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else {
      // Default: Open pricing page or contact sales
      window.open("/pricing", "_blank");
    }
  };

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 ${className}`}
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span>{reason}</span>
        <button
          onClick={handleUpgradeClick}
          className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={`bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-purple-600 dark:text-purple-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
              {feature ? `Unlock ${feature}` : "Upgrade to Pro"}
            </h3>
            <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">
              {reason}
            </p>
            <button
              onClick={handleUpgradeClick}
              className="mt-3 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-md shadow-sm transition-all"
            >
              Upgrade to Pro
              <svg
                className="ml-2 w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden ${className}`}
      >
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-6 h-6 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
                clipRule="evenodd"
              />
            </svg>
            <h3 className="text-lg font-semibold text-white">
              Upgrade to Pro
            </h3>
          </div>
        </div>
        <div className="p-6">
          <p className="text-slate-600 dark:text-slate-300 mb-4">{reason}</p>
          <ul className="space-y-2 mb-6">
            <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg
                className="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Unlimited projects
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg
                className="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Unlimited variables
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg
                className="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Unlimited team members
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg
                className="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              API & extension access
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <svg
                className="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              2-year audit log retention
            </li>
          </ul>
          <button
            onClick={handleUpgradeClick}
            className="w-full py-2 px-4 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-sm transition-all"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  // Modal variant
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onUpgradeClick} />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {feature ? `Unlock ${feature}` : "Upgrade to Pro"}
          </h2>
          <p className="mt-2 text-purple-100">
            Get unlimited access to all features
          </p>
        </div>
        <div className="p-6">
          <p className="text-slate-600 dark:text-slate-300 text-center mb-6">
            {reason}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onUpgradeClick?.()}
              className="flex-1 py-2 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={handleUpgradeClick}
              className="flex-1 py-2 px-4 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-sm transition-all"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
