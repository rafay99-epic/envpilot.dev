"use client";

import { useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { RequireRole, useAuthContext } from "@/components/auth";
import { useAuditLogSummary } from "@/hooks";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalSelect,
  TerminalButton,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import {
  Download,
  Shield,
  Activity,
  AlertTriangle,
  Lock,
  Search,
  ScrollText,
} from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { AuditExportDialog } from "@/components/audit/export-dialog";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateWith, formatNumber } from "@/lib/format";
import { createLogger } from "@/lib/logger";

// Named `logger` because `log` is the audit-row variable throughout this file.
const logger = createLogger("app/dashboard/audit");

const PAGE_SIZE = 25;

const CSV_HEADERS = [
  "Timestamp",
  "Action",
  "User",
  "Email",
  "Severity",
  "IP Address",
];

type AuditExportData = FunctionReturnType<
  typeof api.features.audit.compliance.getForExport
>["data"];

const actionLabels: Record<string, string> = {
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.deleted": "Organization deleted",
  "org.member_added": "Member added",
  "org.member_removed": "Member removed",
  "org.member_role_changed": "Member role changed",
  "project.created": "Project created",
  "workspace.created": "Shared group created",
  "workspace.project_added": "Project started reading shared group",
  "workspace.project_removed": "Project stopped reading shared group",
  "workspace.variable_adopted": "Variable shared across projects",
  "project.updated": "Project updated",
  "project.deleted": "Project deleted",
  "project.restored": "Project restored",
  "project.moved": "Project moved",
  "project.favorited": "Project favorited",
  "project.unfavorited": "Project unfavorited",
  "project.member_added": "Project member added",
  "project.member_removed": "Project member removed",
  "project.member_environments_changed": "Environment access changed",
  "variable.created": "Variable created",
  "variable.updated": "Variable updated",
  "variable.deleted": "Variable deleted",
  "variable.accessed": "Variable accessed",
  "variable.exported": "Variable exported",
  "variable.copied": "Variable copied",
  "permission.granted": "Permission granted",
  "permission.revoked": "Permission revoked",
  "permission.updated": "Permission updated",
  "permission.expired": "Permission expired",
  "permission.bulk_granted": "Bulk permissions granted",
  "permission.bulk_revoked": "Bulk permissions revoked",
  "invitation.sent": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "invitation.declined": "Invitation declined",
  "invitation.expired": "Invitation expired",
  "invitation.resent": "Invitation resent",
  "invitation.canceled": "Invitation canceled",
  "tag.created": "Tag created",
  "tag.updated": "Tag updated",
  "tag.deleted": "Tag deleted",
  "template.created": "Template created",
  "template.updated": "Template updated",
  "template.deleted": "Template deleted",
  "access.token_created": "Access token created",
  "access.token_revoked": "Access token revoked",
  "access.token_refreshed": "Access token refreshed",
  "access.token_used": "Access token used",
  "access.extension_linked": "Extension linked",
  "access.extension_unlinked": "Extension unlinked",
  "api.key_created": "API key created",
  "api.key_revoked": "API key revoked",
  "api.secrets_pulled": "API secrets pulled",
  "api.request_denied": "API request denied",
  "cicd.token_created": "CI/CD token created",
  "cicd.token_revoked": "CI/CD token revoked",
  "cicd.secrets_pulled": "CI/CD secrets pulled",
  "cicd.pull_denied": "CI/CD pull denied",
  "security.access_denied": "Access denied",
  "security.unauthorized_attempt": "Unauthorized attempt",
  "security.permission_check_failed": "Permission check failed",
  "security.token_validation_failed": "Token validation failed",
  "security.rate_limit_exceeded": "Rate limit exceeded",
  "security.suspicious_activity": "Suspicious activity",
  "protection.enabled": "Protection enabled",
  "protection.disabled": "Protection disabled",
  "change.requested": "Change requested",
  "change.applied": "Change applied",
  "change.rejected": "Change rejected",
  "change.canceled": "Change canceled",
  "change.expired": "Change expired",
  "change.overridden": "Protection overridden",
  "change.reminder_sent": "Change reminder sent",
};

const actionCategories = [
  { value: "all", label: "All Events" },
  { value: "org", label: "Organization" },
  { value: "project", label: "Projects" },
  { value: "variable", label: "Variables" },
  { value: "permission", label: "Permissions" },
  { value: "invitation", label: "Invitations" },
  { value: "tag", label: "Tags" },
  { value: "template", label: "Templates" },
  { value: "access", label: "Access" },
  { value: "billing", label: "Billing" },
  { value: "cicd", label: "CI/CD" },
  { value: "api", label: "API" },
  { value: "audit", label: "Audit" },
  { value: "system", label: "System" },
  { value: "security", label: "Security" },
  { value: "protection", label: "Protection" },
  { value: "change", label: "Change requests" },
];

const ENVIRONMENT_FILTERS = ["development", "staging", "production"] as const;

const ENV_CHIP: Record<string, string> = {
  development: "border-accent-line bg-accent-soft text-accent",
  staging: "border-warning-line bg-warning-soft text-warning",
  production: "border-danger-line bg-danger-soft text-danger",
};

const severityColors: Record<string, string> = {
  info: "text-info",
  warning: "text-warning",
  error: "text-danger",
  critical: "text-danger font-bold",
};

const dateRangeMs: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export default function AuditPage() {
  return (
    <RequireRole minimum="project_manager">
      <AuditPageContent />
    </RequireRole>
  );
}

/**
 * Serializes a fetched export and hands the file to the browser. The CSV
 * columns read the export payload's own field names (`timestamp`, not
 * `createdAt`) — the shape the query actually returns.
 */
function downloadExport(data: AuditExportData, format: "csv" | "json") {
  const dateStr = new Date().toISOString().split("T")[0];
  const body =
    format === "json"
      ? JSON.stringify(data, null, 2)
      : [
          CSV_HEADERS,
          ...data.map((row) => [
            row.timestamp,
            actionLabels[row.action] ?? row.action,
            row.userName,
            row.userEmail,
            row.severity,
            row.ipAddress ?? "",
          ]),
        ]
          .map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
          )
          .join("\n");

  const blob = new Blob([body], {
    type: format === "json" ? "application/json" : "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${dateStr}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function AuditPageContent() {
  const convex = useConvex();
  const { organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  // Which environment an event touched, read from the audit row's own details
  // (protection.* and change.* both record `environments`).
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(
    null
  );
  const [dateRange, setDateRange] = useState("30d");
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Fetch logs via Convex cursor pagination (incremental "load more").
  // `results` accumulates every loaded page; client-side filters below
  // operate over this accumulated array exactly as before.
  const {
    results: logs,
    status: logsStatus,
    loadMore: loadMoreLogs,
  } = usePaginatedQuery(
    api.features.audit.queries.listByOrganizationPaginated,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  // Summary stats
  const daysBack =
    dateRange === "24h" ? 1 : parseInt(dateRange.replace("d", ""));
  const summary = useAuditLogSummary(activeOrganizationId, daysBack);

  const isLoading = logsStatus === "LoadingFirstPage";

  // Client-side filtering over the accumulated (multi-page) results
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" ||
      log.action.startsWith(selectedCategory + ".");

    // parsedDetails is JSON.parse output (any); narrow before reading it.
    const details: unknown = log.parsedDetails;
    const environments =
      typeof details === "object" &&
      details !== null &&
      "environments" in details
        ? details.environments
        : undefined;
    const matchesEnvironment =
      selectedEnvironment === null ||
      (Array.isArray(environments) &&
        environments.includes(selectedEnvironment));

    return matchesSearch && matchesCategory && matchesEnvironment;
  });

  // The export is a one-shot read, not a subscription: fetching it from the
  // handler keeps the blob and the download click out of render, where they
  // leaked an object URL (and re-downloaded) on every re-render.
  const handleExport = async (params: {
    startTime: number;
    endTime: number;
    format: "csv" | "json";
  }) => {
    if (!activeOrganizationId || isExporting) return;
    setIsExporting(true);
    setShowExportDialog(false);

    try {
      const exportData = await convex.query(
        api.features.audit.compliance.getForExport,
        {
          organizationId: activeOrganizationId,
          startTime: params.startTime,
          endTime: params.endTime,
          format: "json",
          includeDetails: true,
        }
      );
      downloadExport(exportData.data, params.format);
    } catch (err) {
      logger.error(
        "audit_export_failed",
        { organizationId: activeOrganizationId, format: params.format },
        err
      );
    }
    // Cleared after the try/catch rather than in a finally block: the catch
    // swallows, so this runs on both paths, and React Compiler bails on any
    // function containing a try statement with a finalizer.
    setIsExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={ScrollText}
        title="Audit Logs"
        description="Track all activity across your organization"
        actions={
          <TerminalButton
            variant="secondary"
            onClick={() => setShowExportDialog(true)}
            disabled={isExporting}
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export"}
          </TerminalButton>
        }
      />

      {/* Summary Cards — always render structure, pulse values while loading */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-info-soft">
              <Activity className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Total Events</p>
              {summary ? (
                <p className="text-lg font-bold text-ink">
                  {formatNumber(summary.totalEvents)}
                </p>
              ) : (
                <div className="mt-1 h-5 w-10 animate-pulse rounded bg-surface-raised" />
              )}
            </div>
          </div>
        </TerminalCard>
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Security Events</p>
              {summary ? (
                <p className="text-lg font-bold text-ink">
                  {summary.securityEventCount}
                </p>
              ) : (
                <div className="mt-1 h-5 w-10 animate-pulse rounded bg-surface-raised" />
              )}
            </div>
          </div>
        </TerminalCard>
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft">
              <Lock className="h-4 w-4 text-danger" />
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Sensitive Access</p>
              {summary ? (
                <p className="text-lg font-bold text-ink">
                  {summary.sensitiveAccessCount}
                </p>
              ) : (
                <div className="mt-1 h-5 w-10 animate-pulse rounded bg-surface-raised" />
              )}
            </div>
          </div>
        </TerminalCard>
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
              <Shield className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Period</p>
              {summary ? (
                <p className="text-lg font-bold text-ink">
                  {summary.periodDays}d
                </p>
              ) : (
                <div className="mt-1 h-5 w-10 animate-pulse rounded bg-surface-raised" />
              )}
            </div>
          </div>
        </TerminalCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <TerminalInput
            type="text"
            placeholder="Search by user, action, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <TerminalSelect
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {actionCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </TerminalSelect>
        <div className="flex flex-wrap gap-2">
          {ENVIRONMENT_FILTERS.map((env) => {
            const active = selectedEnvironment === env;
            return (
              <button
                key={env}
                type="button"
                data-testid={`audit-env-${env}`}
                aria-pressed={active}
                onClick={() => setSelectedEnvironment(active ? null : env)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  active
                    ? ENV_CHIP[env]
                    : "border-line text-ink-subtle hover:text-ink-muted"
                }`}
              >
                {env}
              </button>
            );
          })}
        </div>
        <TerminalSelect
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </TerminalSelect>
      </div>

      {/* Audit Logs */}
      {isLoading ? (
        <TerminalWindow title="audit-log">
          <div className="divide-y divide-line">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className="h-3 w-32 animate-pulse rounded bg-surface-raised" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-56 animate-pulse rounded bg-surface-raised" />
                  <div className="flex gap-3">
                    <div className="h-3 w-28 animate-pulse rounded bg-surface-raised/40" />
                    <div className="h-3 w-20 animate-pulse rounded bg-surface-raised/40" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TerminalWindow>
      ) : (
        <TerminalWindow title="audit-log">
          {filteredLogs.length === 0 ? (
            <TerminalEmptyState
              command={`envpilot audit --days ${daysBack}`}
              message={
                logs.length > 0
                  ? "No matching events. Try adjusting your search or filters."
                  : "No audit events yet. Activity will be recorded as you use Envpilot."
              }
            />
          ) : (
            <AnimatedList className="divide-y divide-line">
              {filteredLogs.map((log) => (
                <AuditLogRow key={log._id} log={log} />
              ))}
            </AnimatedList>
          )}
          {(logsStatus === "CanLoadMore" || logsStatus === "LoadingMore") && (
            <div className="flex justify-center border-t border-line px-5 py-4">
              <TerminalButton
                variant="secondary"
                onClick={() => loadMoreLogs(PAGE_SIZE)}
                disabled={logsStatus === "LoadingMore"}
              >
                {logsStatus === "LoadingMore" ? "Loading..." : "Load more"}
              </TerminalButton>
            </div>
          )}
        </TerminalWindow>
      )}

      {/* Export Dialog */}
      <AuditExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* Compliance Info */}
      <TerminalCard>
        <div className="flex items-start gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
            <Shield className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Compliance & Security
            </h3>
            <p className="mt-1 text-sm text-ink-subtle">
              All audit logs are retained for 90 days on the free tier and 365
              days on the pro tier. Logs include IP addresses and user agents
              for security analysis.
            </p>
          </div>
        </div>
      </TerminalCard>
    </div>
  );
}

interface AuditLogData {
  _id: string;
  action: string;
  userName: string;
  userEmail: string;
  severity?: string;
  ipAddress?: string;
  projectId?: string;
  variableId?: string;
  resourceType?: string;
  createdAt: number;
  parsedDetails?: Record<string, unknown> | null;
}

function AuditLogRow({ log }: { log: AuditLogData }) {
  const timeZone = useTimeZone();
  const actionLabel = actionLabels[log.action] || log.action;
  // Seconds are kept: this row is the forensic record of when something ran.
  const time = formatDateWith(
    log.createdAt,
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    },
    timeZone
  );
  const severityClass =
    severityColors[log.severity ?? "info"] ?? "text-ink-subtle";

  // Extract useful details from parsed JSON. Backend call sites store the
  // resource identifier under different names per resource type: `key`
  // (variables), `name` (accounts/projects), `tagName` (tags) — the older
  // variableKey/projectName spellings never matched what audit writes
  // actually record, so rows rendered without any resource identifier.
  const details = log.parsedDetails;
  const detailText = details
    ? (details.key as string) ||
      (details.name as string) ||
      (details.tagName as string) ||
      (details.variableKey as string) ||
      (details.projectName as string) ||
      (details.description as string) ||
      null
    : null;

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs transition-colors hover:bg-accent-soft">
      <span className="shrink-0 whitespace-nowrap text-ink-faint">
        [{time}]
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink-muted">
          <span className="text-accent">{log.userName}</span>{" "}
          <span className={severityClass}>{actionLabel}</span>
          {detailText && (
            <>
              {" "}
              <code className="rounded bg-surface-raised px-1 text-warning">
                {detailText}
              </code>
            </>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-ink-faint">
          <span>{log.userEmail}</span>
          {log.ipAddress && <span>{log.ipAddress}</span>}
          {log.severity && log.severity !== "info" && (
            <span className={severityClass}>{log.severity}</span>
          )}
        </div>
      </div>
    </div>
  );
}
