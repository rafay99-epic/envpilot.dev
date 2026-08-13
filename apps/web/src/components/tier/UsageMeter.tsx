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

  const sizeClasses = {
    sm: {
      container: "h-1.5",
      text: "text-xs",
    },
    md: {
      container: "h-2",
      text: "text-sm",
    },
    lg: {
      container: "h-3",
      text: "text-base",
    },
  };

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
          className={`flex justify-between items-center mb-1 ${sizeClasses[size].text}`}
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
        className={`w-full bg-surface-hover rounded-full overflow-hidden ${sizeClasses[size].container}`}
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

interface UsageSummaryProps {
  usage: {
    projects?: number;
    teamMembers?: number;
    variables?: number;
  };
  limits: {
    maxProjects: number | null;
    maxTeamMembers: number | null;
    maxVariablesPerProject: number | null;
  };
  className?: string;
}

/**
 * Summary component showing multiple usage meters
 */
export function UsageSummary({
  usage,
  limits,
  className = "",
}: UsageSummaryProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {usage.projects !== undefined && (
        <UsageMeter
          current={usage.projects}
          limit={limits.maxProjects}
          label="Projects"
        />
      )}
      {usage.teamMembers !== undefined && (
        <UsageMeter
          current={usage.teamMembers}
          limit={limits.maxTeamMembers}
          label="Team Members"
        />
      )}
      {usage.variables !== undefined && (
        <UsageMeter
          current={usage.variables}
          limit={limits.maxVariablesPerProject}
          label="Variables"
        />
      )}
    </div>
  );
}
