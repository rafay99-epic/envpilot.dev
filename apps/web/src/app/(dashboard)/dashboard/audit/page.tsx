"use client";

import { useState } from "react";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalSelect,
  TerminalButton,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { Download, Shield } from "lucide-react";

const mockAuditLogs: AuditLog[] = [];

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  userEmail: string;
  projectId?: string;
  projectName?: string;
  variableId?: string;
  variableKey?: string;
  details?: string;
  ipAddress?: string;
  createdAt: number;
}

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
  "variable.created": "Variable created",
  "variable.updated": "Variable updated",
  "variable.deleted": "Variable deleted",
  "variable.accessed": "Variable accessed",
  "variable.exported": "Variable exported",
  "permission.granted": "Permission granted",
  "permission.revoked": "Permission revoked",
  "permission.updated": "Permission updated",
  "invitation.sent": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "invitation.declined": "Invitation declined",
  "invitation.expired": "Invitation expired",
  "access.token_created": "Access token created",
  "access.token_revoked": "Access token revoked",
  "access.extension_linked": "Extension linked",
  "access.extension_unlinked": "Extension unlinked",
};

const actionCategories = [
  { value: "all", label: "All Events" },
  { value: "org", label: "Organization" },
  { value: "project", label: "Projects" },
  { value: "variable", label: "Variables" },
  { value: "permission", label: "Permissions" },
  { value: "invitation", label: "Invitations" },
  { value: "access", label: "Access" },
];

export default function AuditPage() {
  const [logs] = useState<AuditLog[]>(mockAuditLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dateRange, setDateRange] = useState("7d");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ??
        false) ||
      (log.variableKey?.toLowerCase().includes(searchQuery.toLowerCase()) ??
        false);

    const matchesCategory =
      selectedCategory === "all" ||
      log.action.startsWith(selectedCategory + ".");

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Audit Logs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track all activity across your organization
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <TerminalInput
            type="text"
            placeholder="Search by user, action, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
        <TerminalButton variant="secondary">
          <Download className="h-4 w-4" />
          Export
        </TerminalButton>
      </div>

      {/* Audit Logs */}
      {filteredLogs.length === 0 ? (
        <TerminalWindow title="audit-log">
          <TerminalEmptyState
            command={`envpilot audit --days ${dateRange === "24h" ? "1" : dateRange.replace("d", "")}`}
            message={
              logs.length > 0
                ? "No matching events. Try adjusting your search or filters."
                : "No audit events yet. Activity will be recorded as you use Envpilot."
            }
          />
        </TerminalWindow>
      ) : (
        <TerminalWindow title="audit-log">
          <div className="divide-y divide-zinc-800/50">
            {filteredLogs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </div>
        </TerminalWindow>
      )}

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

function AuditLogRow({ log }: { log: AuditLog }) {
  const actionLabel = actionLabels[log.action] || log.action;
  const time = new Date(log.createdAt).toLocaleString();

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs">
      <span className="text-zinc-600 whitespace-nowrap">[{time}]</span>
      <div className="min-w-0 flex-1">
        <p className="text-zinc-300">
          <span className="text-green-400">{log.userName}</span>{" "}
          <span className="text-zinc-500">{actionLabel}</span>
          {log.projectName && (
            <>
              {" "}
              in <span className="text-amber-400">{log.projectName}</span>
            </>
          )}
          {log.variableKey && (
            <>
              {" "}
              <code className="rounded bg-zinc-800 px-1 text-amber-400">
                {log.variableKey}
              </code>
            </>
          )}
        </p>
        {log.ipAddress && (
          <p className="mt-0.5 text-zinc-600">{log.ipAddress}</p>
        )}
      </div>
    </div>
  );
}
