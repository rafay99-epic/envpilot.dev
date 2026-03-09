"use client";

interface AuditSummaryData {
  totalEvents: number;
  actionCounts: Record<string, number>;
  severityCounts: Record<string, number>;
  resourceTypeCounts: Record<string, number>;
  sensitiveAccessCount: number;
  securityEventCount: number;
  periodDays: number;
  topActiveUsers: {
    userId: string;
    name: string;
    email: string;
    actionCount: number;
  }[];
}

interface AuditSummaryProps {
  summary: AuditSummaryData | undefined;
  loading?: boolean;
}

const severityLabels: Record<string, { label: string; color: string }> = {
  info: { label: "Info", color: "bg-blue-500" },
  warning: { label: "Warning", color: "bg-yellow-500" },
  error: { label: "Error", color: "bg-red-500" },
  critical: { label: "Critical", color: "bg-red-700" },
};

const resourceTypeLabels: Record<string, string> = {
  organization: "Organization",
  project: "Project",
  variable: "Variable",
  permission: "Permission",
  access_token: "Access Token",
  invitation: "Invitation",
  billing: "Billing",
  security: "Security",
};

export function AuditSummary({ summary, loading }: AuditSummaryProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const statCards = [
    {
      label: "Total Events",
      value: summary.totalEvents.toLocaleString(),
      subLabel: `Last ${summary.periodDays} days`,
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Sensitive Access",
      value: summary.sensitiveAccessCount.toLocaleString(),
      subLabel: "Sensitive data viewed",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "Security Events",
      value: summary.securityEventCount.toLocaleString(),
      subLabel: "Alerts & warnings",
      icon: (
        <svg
          className="h-5 w-5"
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
      color:
        summary.securityEventCount > 0
          ? "text-red-600 dark:text-red-400"
          : "text-green-600 dark:text-green-400",
      bgColor:
        summary.securityEventCount > 0
          ? "bg-red-50 dark:bg-red-900/20"
          : "bg-green-50 dark:bg-green-900/20",
    },
    {
      label: "Active Users",
      value: summary.topActiveUsers.length.toLocaleString(),
      subLabel: "Contributors",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bgColor} ${stat.color}`}
              >
                {stat.icon}
              </div>
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {stat.value}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {stat.subLabel}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Severity Distribution */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Severity Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {Object.entries(summary.severityCounts).length > 0 ? (
              Object.entries(summary.severityCounts).map(
                ([severity, count]) => {
                  const config = severityLabels[severity] || {
                    label: severity,
                    color: "bg-gray-500",
                  };
                  const percentage = (count / summary.totalEvents) * 100;
                  return (
                    <div key={severity}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {config.label}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {count}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${config.color}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No severity data available
              </p>
            )}
          </div>
        </div>

        {/* Resource Types */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Activity by Resource
          </h3>
          <div className="mt-4 space-y-2">
            {Object.entries(summary.resourceTypeCounts).length > 0 ? (
              Object.entries(summary.resourceTypeCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {resourceTypeLabels[type] || type}
                    </span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {count}
                    </span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No resource data available
              </p>
            )}
          </div>
        </div>

        {/* Top Users */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Most Active Users
          </h3>
          <div className="mt-4 space-y-3">
            {summary.topActiveUsers.length > 0 ? (
              summary.topActiveUsers.map((user, index) => (
                <div key={user.userId} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {index + 1}
                  </span>
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {user.email}
                    </p>
                  </div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {user.actionCount}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No user activity data
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
