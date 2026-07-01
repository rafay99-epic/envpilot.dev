"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import { useAnalytics } from "@/hooks";
import type { Id } from "@convex/_generated/dataModel";
import { TerminalEmptyState } from "@/components/dashboard/terminal-ui";
import dynamic from "next/dynamic";

// Deterministic bar heights — avoids impure Math.random() in render
const SKELETON_BAR_HEIGHTS = [35, 58, 42, 71, 28, 63, 49, 76, 33, 55, 44, 68];

// Skeleton placeholder for lazy-loaded chart panels
function ChartSkeleton({ height = "h-48" }: { height?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-zinc-700" />
        <div className="h-3 w-3 rounded-full bg-zinc-700" />
        <div className="h-3 w-3 rounded-full bg-zinc-700" />
        <div className="ml-2 h-3 w-28 animate-pulse rounded bg-zinc-700" />
      </div>
      <div className={`${height} animate-pulse bg-zinc-900/50 p-6`}>
        <div className="flex h-full items-end gap-1">
          {SKELETON_BAR_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-zinc-800/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Skeleton for the 4-card security insight row
function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-800" />
            <div className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
              <div className="h-5 w-10 animate-pulse rounded bg-zinc-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Lazy-load chart components — recharts is ~200 KB; only load on this page
const ActivityChart = dynamic(
  () =>
    import("@/components/dashboard/analytics").then((mod) => mod.ActivityChart),
  { ssr: false, loading: () => <ChartSkeleton height="h-64" /> }
);
const ProjectActivityChart = dynamic(
  () =>
    import("@/components/dashboard/analytics").then(
      (mod) => mod.ProjectActivityChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const VariableChangesChart = dynamic(
  () =>
    import("@/components/dashboard/analytics").then(
      (mod) => mod.VariableChangesChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const TeamActivityChart = dynamic(
  () =>
    import("@/components/dashboard/analytics").then(
      (mod) => mod.TeamActivityChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const SecurityInsights = dynamic(
  () =>
    import("@/components/dashboard/analytics").then(
      (mod) => mod.SecurityInsights
    ),
  { ssr: false, loading: () => <InsightsSkeleton /> }
);
const ResourceBreakdownChart = dynamic(
  () =>
    import("@/components/dashboard/analytics").then(
      (mod) => mod.ResourceBreakdownChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

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
  const { organization, canDo } = useAuthContext();
  const [daysBack, setDaysBack] = useState<TimeRange>(30);
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;

  // Only owners and project managers can access analytics — others are
  // redirected to the dashboard
  const canViewAnalytics = canDo("org:create_project");

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
        {/* Show layout-matching skeletons to prevent layout shift */}
        <ChartSkeleton height="h-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <InsightsSkeleton />
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
