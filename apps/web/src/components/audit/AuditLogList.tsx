import { formatDistanceToNow } from "date-fns";

interface AuditLogEntry {
  _id: string;
  action: string;
  userName: string;
  userEmail: string;
  createdAt: number;
  severity?: string;
  resourceType?: string;
  ipAddress?: string;
  involvesSensitiveData?: boolean;
  parsedDetails?: Record<string, unknown>;
}

interface AuditLogListProps {
  logs: AuditLogEntry[] | undefined;
  loading?: boolean;
  emptyMessage?: string;
  showProject?: boolean;
  showVariable?: boolean;
}

const actionLabels: Record<string, string> = {
  "org.created": "Created organization",
  "org.updated": "Updated organization",
  "org.deleted": "Deleted organization",
  "org.member_added": "Added team member",
  "org.member_removed": "Removed team member",
  "org.member_role_changed": "Changed member role",
  "project.created": "Created project",
  "project.updated": "Updated project",
  "project.deleted": "Deleted project",
  "project.restored": "Restored project",
  "project.moved": "Moved project",
  "project.favorited": "Favorited project",
  "project.unfavorited": "Unfavorited project",
  "project.member_added": "Added project member",
  "project.member_removed": "Removed project member",
  "project.member_environments_changed": "Changed environment access",
  "variable.created": "Created variable",
  "variable.updated": "Updated variable",
  "variable.deleted": "Deleted variable",
  "variable.accessed": "Accessed variable",
  "variable.exported": "Exported variable",
  "variable.copied": "Copied variable",
  "variable.bulk_imported": "Bulk imported variables",
  "variable.rollback": "Rolled back variable",
  "variable.restored": "Restored variable",
  "permission.granted": "Granted permission",
  "permission.revoked": "Revoked permission",
  "permission.updated": "Updated permission",
  "permission.expired": "Permission expired",
  "permission.bulk_granted": "Bulk granted permissions",
  "permission.bulk_revoked": "Bulk revoked permissions",
  "security.access_denied": "Access denied",
  "security.unauthorized_attempt": "Unauthorized attempt",
  "security.permission_check_failed": "Permission check failed",
  "security.token_validation_failed": "Token validation failed",
  "security.rate_limit_exceeded": "Rate limit exceeded",
  "security.suspicious_activity": "Suspicious activity detected",
  "invitation.sent": "Sent invitation",
  "invitation.accepted": "Accepted invitation",
  "invitation.declined": "Declined invitation",
  "invitation.expired": "Invitation expired",
  "invitation.resent": "Resent invitation",
  "invitation.canceled": "Canceled invitation",
  "tag.created": "Created tag",
  "tag.updated": "Updated tag",
  "tag.deleted": "Deleted tag",
  "template.created": "Created template",
  "template.updated": "Updated template",
  "template.deleted": "Deleted template",
  "access.token_created": "Created access token",
  "access.token_revoked": "Revoked access token",
  "access.token_refreshed": "Refreshed access token",
  "access.token_used": "Used access token",
  "access.extension_linked": "Linked extension",
  "access.extension_unlinked": "Unlinked extension",
  "api.key_created": "Created API key",
  "api.key_revoked": "Revoked API key",
  "api.secrets_pulled": "Pulled API secrets",
  "api.request_denied": "API request denied",
  "cicd.token_created": "Created CI/CD token",
  "cicd.token_revoked": "Revoked CI/CD token",
  "cicd.secrets_pulled": "Pulled CI/CD secrets",
  "cicd.pull_denied": "CI/CD pull denied",
  "billing.subscription_created": "Created subscription",
  "billing.subscription_updated": "Updated subscription",
  "billing.subscription_canceled": "Canceled subscription",
  "billing.payment_succeeded": "Payment succeeded",
  "billing.payment_failed": "Payment failed",
  "billing.tier_upgraded": "Upgraded tier",
  "billing.tier_downgraded": "Downgraded tier",
  "audit.exported": "Exported audit logs",
  "audit.viewed": "Viewed audit logs",
};

const severityColors: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  info: {
    bg: "bg-info-soft",
    text: "text-info",
    dot: "bg-info",
  },
  warning: {
    bg: "bg-warning-soft",
    text: "text-warning",
    dot: "bg-warning",
  },
  error: {
    bg: "bg-danger-soft",
    text: "text-danger",
    dot: "bg-danger",
  },
  critical: {
    bg: "bg-danger-soft",
    text: "text-danger",
    dot: "bg-danger",
  },
};

const actionIcons: Record<string, React.ReactNode> = {
  variable: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  ),
  permission: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  security: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  access_token: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  ),
  organization: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
  project: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
  invitation: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  billing: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  ),
  api: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.909c0-.7.279-1.372.776-1.869l8.14-8.14c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
      />
    </svg>
  ),
  cicd: (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  ),
};

function getActionCategory(action: string): string {
  if (action.startsWith("variable.")) return "variable";
  if (action.startsWith("permission.")) return "permission";
  if (action.startsWith("security.")) return "security";
  if (action.startsWith("access.")) return "access_token";
  if (action.startsWith("org.")) return "organization";
  if (action.startsWith("project.")) return "project";
  if (action.startsWith("invitation.")) return "invitation";
  if (action.startsWith("billing.")) return "billing";
  if (action.startsWith("api.")) return "api";
  if (action.startsWith("cicd.")) return "cicd";
  return "organization";
}

export function AuditLogList({
  logs,
  loading,
  emptyMessage = "No audit logs found",
}: AuditLogListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-line bg-white p-4 border-line bg-surface"
          >
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-surface-hover" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-surface-hover" />
                <div className="h-3 w-1/2 rounded bg-surface-hover" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white p-8 text-center border-line bg-surface">
        <svg
          className="mx-auto h-12 w-12 text-ink-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="mt-4 text-sm text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const severity = log.severity || "info";
        const colors = severityColors[severity] || severityColors.info;
        const category = getActionCategory(log.action);
        const icon = actionIcons[category] || actionIcons.organization;

        return (
          <div
            key={log._id}
            className={`rounded-lg border p-4 transition-colors ${
              severity === "critical" || severity === "warning"
                ? `${colors.bg} border-${severity === "critical" ? "red" : "yellow"}-200 border-${severity === "critical" ? "red" : "yellow"}-800`
                : "border-line bg-white border-line bg-surface"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.bg} ${colors.text}`}
              >
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {actionLabels[log.action] || log.action}
                  </span>
                  {log.involvesSensitiveData && (
                    <span className="inline-flex items-center rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger bg-danger-soft text-danger">
                      Sensitive
                    </span>
                  )}
                  {severity !== "info" && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${colors.dot}`}
                      />
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                  <span>by {log.userName}</span>
                  <span>&middot;</span>
                  <span>
                    {formatDistanceToNow(new Date(log.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  {log.ipAddress && (
                    <>
                      <span>&middot;</span>
                      <span className="font-mono text-xs">{log.ipAddress}</span>
                    </>
                  )}
                </div>
                {log.parsedDetails &&
                  Object.keys(log.parsedDetails).length > 0 && (
                    <div className="mt-2 rounded bg-surface-raised p-2 text-xs font-mono text-ink-faint bg-surface-raised text-ink-muted">
                      {Object.entries(log.parsedDetails)
                        .filter(
                          ([key]) =>
                            ![
                              "key",
                              "bulkImport",
                              "bulkGrant",
                              "bulkRevoke",
                            ].includes(key)
                        )
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <div key={key} className="truncate">
                            <span className="text-ink-subtle">{key}:</span>{" "}
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                          </div>
                        ))}
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
