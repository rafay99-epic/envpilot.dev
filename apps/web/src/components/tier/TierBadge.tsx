"use client";

interface TierBadgeProps {
  tier: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const DEFAULT_TIER_STYLES: Record<string, string> = {
  free: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  pro: "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm",
};

const FALLBACK_STYLE =
  "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm";

/**
 * Badge component to display the organization's subscription tier.
 * Supports dynamic tier names — known tiers get specific styling,
 * unknown tiers get a default gradient.
 */
export function TierBadge({
  tier,
  size = "md",
  showLabel = true,
}: TierBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-0.5",
    lg: "text-base px-3 py-1",
  };

  const style = DEFAULT_TIER_STYLES[tier] ?? FALLBACK_STYLE;
  const isSpecial = tier !== "free";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses[size]} ${style}`}
    >
      {isSpecial && (
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {showLabel && tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}
