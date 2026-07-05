"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { RequireRole, useAuthContext } from "@/components/auth";
import { useAuditLogSummary, useAuditLogsForExport } from "@/hooks";
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
} from "lucide-react";
import { AuditExportDialog } from "@/components/audit/export-dialog";

const PAGE_SIZE = 25;

const actionLabels: Record<string, string> = {
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.deleted": "Organization deleted",
  "org.member_added": "Member added",
  "org.member_removed": "Member removed",
  "org.member_role_changed": "Member role changed",
  "project.created": "Project created",
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
  "security.access_denied": "Access denied",
  "security.unauthorized_attempt": "Unauthorized attempt",
  "security.permission_check_failed": "Permission check failed",
  "security.token_validation_failed": "Token validation failed",
  "security.rate_limit_exceeded": "Rate limit exceeded",
  "security.suspicious_activity": "Suspicious activity",
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
  { value: "audit", label: "Audit" },
  { value: "system", label: "System" },
  { value: "security", label: "Security" },
];

const severityColors: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
  critical: "text-red-500 font-bold",
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

function AuditPageContent() {
  const { organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dateRange, setDateRange] = useState("30d");
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json");
  const [exportRange, setExportRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Fetch logs via Convex cursor pagination (incremental "load more").
  // `results` accumulates every loaded page; client-side filters below
  // operate over this accumulated array exactly as before.
  const {
    results: logs,
    status: logsStatus,
    loadMore: loadMoreLogs,
  } = usePaginatedQuery(
    api.auditLogs.listByOrganizationPaginated,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  // Summary stats
  const daysBack =
    dateRange === "24h" ? 1 : parseInt(dateRange.replace("d", ""));
  const summary = useAuditLogSummary(activeOrganizationId, daysBack);

  // Export data - only fetched when exporting
  const exportData = useAuditLogsForExport(
    isExporting && exportRange ? activeOrganizationId : undefined,
    exportRange?.start ?? 0,
    exportRange?.end ?? 0,
    "json",
    true
  );

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

    return matchesSearch && matchesCategory;
  });

  const handleExport = (params: {
    startTime: number;
    endTime: number;
    format: "csv" | "json";
  }) => {
    setExportFormat(params.format);
    setExportRange({ start: params.startTime, end: params.endTime });
    setIsExporting(true);
    setShowExportDialog(false);
  };

  // Trigger download once export data is ready
  if (isExporting && exportData) {
    const dateStr = new Date().toISOString().split("T")[0];

    if (exportFormat === "json") {
      const blob = new Blob([JSON.stringify(exportData.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV from full export data
      const exportLogs = exportData.data as unknown as Array<{
        createdAt: number;
        action: string;
        userName: string;
        userEmail: string;
        severity?: string;
        ipAddress?: string;
      }>;
      const headers = [
        "Timestamp",
        "Action",
        "User",
        "Email",
        "Severity",
        "IP Address",
      ];
      const rows = exportLogs.map((log) => [
        new Date(log.createdAt).toISOString(),
        actionLabels[log.action] ?? log.action,
        log.userName,
        log.userEmail,
        log.severity ?? "info",
        log.ipAddress ?? "",
      ]);
      const csvContent = [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setIsExporting(false);
    setExportRange(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Audit Logs</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Track all activity across your organization
          </p>
        </div>
        <TerminalButton
          variant="secondary"
          onClick={() => setShowExportDialog(true)}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" />
          {isExporting ? "Exporting..." : "Export"}
        </TerminalButton>
      </div>

      {/* Summary Cards — always render structure, pulse values while loading */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10">
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Events</p>
              {summary ? (
                <p className="text-lg font-bold text-zinc-100">
                  {summary.totalEvents.toLocaleString()}
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
              <p className="text-xs text-zinc-500">Security Events</p>
              {summary ? (
                <p className="text-lg font-bold text-zinc-100">
                  {summary.securityEventCount}
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
              <Lock className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Sensitive Access</p>
              {summary ? (
                <p className="text-lg font-bold text-zinc-100">
                  {summary.sensitiveAccessCount}
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
              <Shield className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Period</p>
              {summary ? (
                <p className="text-lg font-bold text-zinc-100">
                  {summary.periodDays}d
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
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
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
          <div className="divide-y divide-zinc-800/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-56 animate-pulse rounded bg-zinc-800" />
                  <div className="flex gap-3">
                    <div className="h-3 w-28 animate-pulse rounded bg-zinc-800/40" />
                    <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/40" />
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
            <AnimatedList className="divide-y divide-zinc-800/50">
              {filteredLogs.map((log) => (
                <AuditLogRow key={log._id} log={log} />
              ))}
            </AnimatedList>
          )}
          {(logsStatus === "CanLoadMore" || logsStatus === "LoadingMore") && (
            <div className="flex justify-center border-t border-zinc-800/50 px-5 py-4">
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
            <Shield className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Compliance & Security
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
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
  const actionLabel = actionLabels[log.action] || log.action;
  const time = new Date(log.createdAt).toLocaleString();
  const severityClass =
    severityColors[log.severity ?? "info"] ?? "text-zinc-500";

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
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs transition-colors hover:bg-green-500/5">
      <span className="shrink-0 whitespace-nowrap text-zinc-600">[{time}]</span>
      <div className="min-w-0 flex-1">
        <p className="text-zinc-300">
          <span className="text-green-400">{log.userName}</span>{" "}
          <span className={severityClass}>{actionLabel}</span>
          {detailText && (
            <>
              {" "}
              <code className="rounded bg-zinc-800 px-1 text-amber-400">
                {detailText}
              </code>
            </>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-zinc-600">
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
