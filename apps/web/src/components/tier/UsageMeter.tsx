import { calculateLimitPercentage } from "@/hooks/useTierLimits";
import { Infinity } from "lucide-react";

interface UsageMeterProps {
  /**
   * Current usage count
   */
  current: number;
  /**
   * Maximum limit (null = unlimited)
   */
  limit: number | null;
  /**
   * Label for the resource being measured
   */
  label: string;
  /**
   * Show the numeric value
   */
  showValue?: boolean;
  /**
   * Size variant
   */
  size?: "sm" | "md" | "lg";
  /**
   * Optional className
   */
  className?: string;
}

/**
 * Visual meter showing usage against limit
 */
const METER_SIZE_CLASSES = {
  sm: { container: "h-1.5", text: "text-xs" },
  md: { container: "h-2", text: "text-sm" },
  lg: { container: "h-3", text: "text-base" },
};

export function UsageMeter({
  current,
  limit,
  label,
  showValue = true,
  size = "md",
  className = "",
}: UsageMeterProps) {
  const percentage = calculateLimitPercentage(current, limit);
  const isUnlimited = limit === null;
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  const getBarColor = () => {
    if (isUnlimited) return "bg-accent";
    if (isAtLimit) return "bg-danger";
    if (isNearLimit) return "bg-warning";
    return "bg-accent";
  };

  const getTextColor = () => {
    if (isUnlimited) return "text-accent";
    if (isAtLimit) return "text-danger";
    if (isNearLimit) return "text-warning";
    return "text-ink-muted";
  };

  return (
    <div className={`${className}`}>
      {showValue && (
        <div
          className={`flex justify-between items-center mb-1 ${METER_SIZE_CLASSES[size].text}`}
        >
          <span className="font-medium text-ink-muted">{label}</span>
          <span className={getTextColor()}>
            {isUnlimited ? (
              <span className="flex items-center gap-1">
                <Infinity className="h-3.5 w-3.5" />
                Unlimited
              </span>
            ) : (
              `${current} / ${limit}`
            )}
          </span>
        </div>
      )}
      <div
        className={`w-full bg-surface-hover rounded-full overflow-hidden ${METER_SIZE_CLASSES[size].container}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{
            width: isUnlimited ? "100%" : `${Math.min(percentage, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
