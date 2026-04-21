"use client";

import { useState } from "react";
import { useAuthContext, RequirePermission } from "@/components/auth";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  useAnomalyEvents,
  useAnomalyEventSummary,
} from "@/hooks/useAnomalyDetection";
import { useConvexUser } from "@/hooks";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalCard,
  TerminalSelect,
  TerminalButton,
  TerminalButtonLink,
  TerminalBadge,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Settings2,
} from "lucide-react";

type AnomalyStatus = "open" | "acknowledged" | "dismissed" | "resolved";
type AnomalySeverity = "info" | "warning" | "critical";

const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

const severityOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

const severityBadgeColor: Record<AnomalySeverity, "red" | "amber" | "blue"> = {
  critical: "red",
  warning: "amber",
  info: "blue",
};

const severityIcon: Record<AnomalySeverity, React.ReactNode> = {
  critical: <AlertCircle className="h-4 w-4 text-red-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  info: <Info className="h-4 w-4 text-blue-400" />,
};

const statusBadgeColor: Record<
  AnomalyStatus,
  "red" | "amber" | "green" | "zinc"
> = {
  open: "red",
  acknowledged: "amber",
  dismissed: "zinc",
  resolved: "green",
};

export default function AnomaliesPage() {
  const { organization, user } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;

  const { convexUserId } = useConvexUser(user?.id);

  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const queryStatus =
    statusFilter === "all" ? undefined : (statusFilter as AnomalyStatus);

  const eventsData = useAnomalyEvents(activeOrganizationId, {
    status: queryStatus,
    limit: 100,
  });
  const summaryData = useAnomalyEventSummary(activeOrganizationId, 30);

  const dismissMutation = useMutation(api.anomalyDetection.dismissAnomaly);

  // Optimistic dismiss tracking — dismissed events hide instantly
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<string>>(
    new Set()
  );

  const isLoading = eventsData === undefined;
  const events = (eventsData?.events ?? []).filter(
    (e: { _id: string }) => !optimisticDismissed.has(e._id as string)
  );
  const summary = summaryData?.summary;

  // Client-side severity filter (status is server-side)
  const filteredEvents =
    severityFilter === "all"
      ? events
      : events.filter(
          (e: { severity: string }) => e.severity === severityFilter
        );

  const handleDismiss = async (eventId: Id<"anomalyEvents">) => {
    if (!convexUserId) return;

    // Optimistic: hide immediately
    setOptimisticDismissed((prev) => new Set(prev).add(eventId as string));

    try {
      await dismissMutation({
        anomalyEventId: eventId,
        dismissedBy: convexUserId,
        reason: "Dismissed from dashboard",
      });
    } catch {
      // Rollback on failure — re-show the event
      setOptimisticDismissed((prev) => {
        const next = new Set(prev);
        next.delete(eventId as string);
        return next;
      });
    }
  };

  return (
    <RequirePermission
      action="org:view_anomalies"
      fallback={
        <TerminalWindow title="Anomaly Detection">
          <TerminalEmptyState
            command="access denied"
            message="Access restricted — anomaly detection is available to admins and team leads only."
          />
        </TerminalWindow>
      }
    >
      <FeatureGate
        organizationId={activeOrganizationId}
        featureKey="anomaly_detection"
        featureName="Anomaly Detection"
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">
                Anomaly Detection
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Monitor unusual access patterns across your organization
              </p>
            </div>
            <TerminalButtonLink
              variant="secondary"
              href="/dashboard/anomalies/rules"
            >
              <Settings2 className="h-4 w-4" />
              Rules
            </TerminalButtonLink>
          </div>

          {/* Summary Cards — show skeleton placeholders while loading */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TerminalCard>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10">
                  <ShieldAlert className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Total Events</p>
                  {summary ? (
                    <p className="text-lg font-bold text-zinc-100">
                      {summary.total.toLocaleString()}
                    </p>
                  ) : (
                    <div className="mt-1 h-5 w-10 animate-pulse rounded bg-zinc-800" />
                  )}
                </div>
              </div>
            </TerminalCard>
            <TerminalCard>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Critical</p>
                  {summary ? (
                    <p className="text-lg font-bold text-zinc-100">
                      {summary.bySeverity.critical}
                    </p>
                  ) : (
                    <div className="mt-1 h-5 w-10 animate-pulse rounded bg-zinc-800" />
                  )}
                </div>
              </div>
            </TerminalCard>
            <TerminalCard>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Warning</p>
                  {summary ? (
                    <p className="text-lg font-bold text-zinc-100">
                      {summary.bySeverity.warning}
                    </p>
                  ) : (
                    <div className="mt-1 h-5 w-10 animate-pulse rounded bg-zinc-800" />
                  )}
                </div>
              </div>
            </TerminalCard>
            <TerminalCard>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Open</p>
                  {summary ? (
                    <p className="text-lg font-bold text-zinc-100">
                      {summary.byStatus.open}
                    </p>
                  ) : (
                    <div className="mt-1 h-5 w-10 animate-pulse rounded bg-zinc-800" />
                  )}
                </div>
              </div>
            </TerminalCard>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TerminalSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TerminalSelect>
            <TerminalSelect
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              {severityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TerminalSelect>
          </div>

          {/* Events List */}
          {isLoading ? (
            <TerminalWindow title="anomaly-events">
              <div className="divide-y divide-zinc-800/50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
                    <div className="h-4 w-4 animate-pulse rounded bg-zinc-800/60" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-64 animate-pulse rounded bg-zinc-800" />
                      <div className="flex gap-2">
                        <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800/60" />
                        <div className="h-5 w-14 animate-pulse rounded-full bg-zinc-800/60" />
                        <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/40" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TerminalWindow>
          ) : filteredEvents.length === 0 ? (
            <TerminalWindow title="anomaly-events">
              <TerminalEmptyState
                command="anomaly-events --status open"
                message={
                  events.length > 0
                    ? "No events match the current filters. Try adjusting your filters."
                    : "No anomaly events detected. The system will alert you when unusual patterns are identified."
                }
              />
            </TerminalWindow>
          ) : (
            <TerminalWindow title="anomaly-events">
              <AnimatedList className="divide-y divide-zinc-800/50">
                {filteredEvents.map(
                  (event: {
                    _id: Id<"anomalyEvents">;
                    detectedAt: number;
                    severity: AnomalySeverity;
                    ruleName: string;
                    userName: string;
                    userEmail: string;
                    status: AnomalyStatus;
                    parsedDetails: Record<string, unknown>;
                  }) => (
                    <AnomalyEventRow
                      key={event._id}
                      event={event}
                      onDismiss={handleDismiss}
                      canDismiss={!!convexUserId && event.status === "open"}
                    />
                  )
                )}
              </AnimatedList>
            </TerminalWindow>
          )}

          {/* Info Card */}
          <TerminalCard>
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10">
                <ShieldAlert className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  How Anomaly Detection Works
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  The system builds behavioral baselines from your team&apos;s
                  audit logs and flags deviations such as new IPs, off-hours
                  access, velocity spikes, and first-time production exports.
                  Rules can be configured on the{" "}
                  <a
                    href="/dashboard/anomalies/rules"
                    className="text-green-400 hover:underline"
                  >
                    Rules page
                  </a>
                  .
                </p>
              </div>
            </div>
          </TerminalCard>
        </div>
      </FeatureGate>
    </RequirePermission>
  );
}

function AnomalyEventRow({
  event,
  onDismiss,
  canDismiss,
}: {
  event: {
    _id: Id<"anomalyEvents">;
    detectedAt: number;
    severity: AnomalySeverity;
    ruleName: string;
    userName: string;
    userEmail: string;
    status: AnomalyStatus;
    parsedDetails: Record<string, unknown>;
  };
  onDismiss: (id: Id<"anomalyEvents">) => void;
  canDismiss: boolean;
}) {
  const time = new Date(event.detectedAt).toLocaleString();
  const message = (event.parsedDetails?.message as string) ?? event.ruleName;

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs transition-colors hover:bg-green-500/5">
      <span className="shrink-0 whitespace-nowrap text-zinc-600">[{time}]</span>
      <div className="flex shrink-0 pt-0.5">{severityIcon[event.severity]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-zinc-300">
          <span className="text-green-400">{event.userName}</span>{" "}
          <span className="text-zinc-400">{message}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <TerminalBadge color={severityBadgeColor[event.severity]}>
            {event.severity}
          </TerminalBadge>
          <TerminalBadge color={statusBadgeColor[event.status]}>
            {event.status}
          </TerminalBadge>
          <span className="text-zinc-600">{event.ruleName}</span>
          <span className="text-zinc-600">{event.userEmail}</span>
        </div>
      </div>
      {canDismiss && (
        <TerminalButton
          variant="secondary"
          className="shrink-0 text-xs"
          onClick={() => onDismiss(event._id)}
        >
          Dismiss
        </TerminalButton>
      )}
    </div>
  );
}
