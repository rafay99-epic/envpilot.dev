"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import { useAnalytics } from "@/hooks";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import {
  ActivityChart,
  ProjectActivityChart,
  VariableChangesChart,
  TeamActivityChart,
  SecurityInsights,
  ResourceBreakdownChart,
} from "@/components/dashboard/analytics";

type TimeRange = 7 | 30 | 90;

const PERMISSION_ACTIONS = [
  "permission.granted",
  "permission.revoked",
  "permission.updated",
  "permission.expired",
  "permission.bulk_granted",
  "permission.bulk_revoked",
];

function getPermissionChangeCount(
  actionCounts: Record<string, number>
): number {
  let count = 0;
  for (const action of PERMISSION_ACTIONS) {
    count += actionCounts[action] ?? 0;
  }
  return count;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { organization, hasPermission } = useAuthContext();
  const [daysBack, setDaysBack] = useState<TimeRange>(30);
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;

  // Only admin and team lead can access analytics — redirect members to dashboard
  const canViewAnalytics = hasPermission(PERMISSIONS.PROJECT_CREATE);

  // Single unified query — no duplicate audit log fetches
  const { analytics, isLoading } = useAnalytics(
    canViewAnalytics ? activeOrganizationId : undefined,
    daysBack
  );

  const maxRetentionDays =
    (analytics?.maxRetentionDays as number | undefined) ?? null;

  if (!organization || !canViewAnalytics) {
    router.replace("/dashboard");
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Header
          daysBack={daysBack}
          setDaysBack={setDaysBack}
          maxRetentionDays={maxRetentionDays}
        />
        <TerminalWindow title="loading-analytics">
          <TerminalLoading />
        </TerminalWindow>
      </div>
    );
  }

  if (!analytics || analytics.totalEvents === 0) {
    return (
      <div className="space-y-6">
        <Header
          daysBack={daysBack}
          setDaysBack={setDaysBack}
          maxRetentionDays={maxRetentionDays}
        />
        <TerminalEmptyState
          command="envpilot analytics"
          message={`No activity data in the last ${daysBack} days. Start by creating a project and adding variables!`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        daysBack={daysBack}
        setDaysBack={setDaysBack}
        maxRetentionDays={maxRetentionDays}
      />

      {/* Row 1: Activity Overview */}
      <ActivityChart dailyCounts={analytics.dailyCounts} daysBack={daysBack} />

      {/* Row 2: Projects + Variable Changes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectActivityChart data={analytics.projectActivity} />
        <VariableChangesChart data={analytics.variableChangesByProject} />
      </div>

      {/* Row 3: Team + Resource Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamActivityChart users={analytics.topActiveUsers} />
        <ResourceBreakdownChart
          resourceTypeCounts={analytics.resourceTypeCounts}
        />
      </div>

      {/* Row 4: Security Insights */}
      <SecurityInsights
        securityEventCount={analytics.securityEventCount}
        sensitiveAccessCount={analytics.sensitiveAccessCount}
        severityCounts={analytics.severityCounts}
        permissionChangeCount={getPermissionChangeCount(analytics.actionCounts)}
      />
    </div>
  );
}

function Header({
  daysBack,
  setDaysBack,
  maxRetentionDays,
}: {
  daysBack: TimeRange;
  setDaysBack: (v: TimeRange) => void;
  maxRetentionDays: number | null;
}) {
  const ranges: TimeRange[] = [7, 30, 90];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="font-mono">
        <p className="text-xs text-zinc-500">
          <span className="text-green-400">$</span> envpilot analytics
        </p>
        <h1 className="mt-1 text-xl font-bold text-zinc-100">Analytics</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-1">
          {ranges.map((range) => {
            const disabled =
              maxRetentionDays !== null && range > maxRetentionDays;
            return (
              <button
                key={range}
                onClick={() => !disabled && setDaysBack(range)}
                disabled={disabled}
                title={disabled ? "Upgrade for longer history" : undefined}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                  disabled
                    ? "cursor-not-allowed text-zinc-700"
                    : daysBack === range
                      ? "bg-green-500/15 text-green-400"
                      : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {range}d
              </button>
            );
          })}
        </div>
        {maxRetentionDays !== null && (
          <span
            className="text-[10px] text-zinc-600"
            title="Your plan limits analytics retention"
          >
            max {maxRetentionDays}d
          </span>
        )}
      </div>
    </div>
  );
}
