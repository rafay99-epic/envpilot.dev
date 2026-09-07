"use client";

import type { useDashboardStats } from "@/hooks";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";

type DashboardStats = ReturnType<typeof useDashboardStats>["stats"];

// The `envpilot stats` terminal window on the dashboard home.
export function SystemStatusPanel({
  stats,
  isLoading,
}: {
  stats: DashboardStats;
  isLoading: boolean;
}) {
  return (
    <TerminalWindow title="system-status">
      <div className="p-5 font-mono text-sm">
        {isLoading ? (
          <TerminalLoading />
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-subtle mb-3">
              <span className="text-accent">$</span> envpilot stats
            </p>
            <StatLine
              label="projects"
              value={String(stats?.projects.total ?? 0)}
              detail={`+${stats?.projects.thisMonth ?? 0} this month`}
            />
            <StatLine
              label="variables"
              value={String(stats?.variables.total ?? 0)}
              detail={`${stats?.variables.encrypted ?? 0} encrypted`}
            />
            <StatLine
              label="team"
              value={String(stats?.team.total ?? 1)}
              detail={stats?.team.total === 1 ? "just you" : "active"}
            />
            <StatLine
              label="events"
              value={String(stats?.auditEvents.last7Days ?? 0)}
              detail="last 7 days"
            />
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}

function StatLine({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  const dots = ".".repeat(Math.max(2, 20 - label.length));
  return (
    <p className="text-ink-muted">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink-faint"> {dots} </span>
      <span className="text-accent font-semibold">{value}</span>
      <span className="text-ink-faint ml-3 text-xs">({detail})</span>
    </p>
  );
}
