"use client";

import { useEffect, useState } from "react";

const STATUS_PAGE_URL =
  process.env.NEXT_PUBLIC_STATUS_PAGE_URL ||
  "https://stats.uptimerobot.com/FxXv9XmG1h";

type ServiceStatus = "operational" | "degraded" | "down" | "unknown";

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; dot: string; ping: string; text: string }
> = {
  operational: {
    label: "All systems operational",
    dot: "bg-accent",
    ping: "bg-accent",
    text: "text-ink-faint hover:text-accent",
  },
  degraded: {
    label: "Partial service disruption",
    dot: "bg-warning",
    ping: "bg-warning",
    text: "text-warning hover:text-warning",
  },
  down: {
    label: "Service disruption",
    dot: "bg-danger",
    ping: "bg-danger",
    text: "text-danger hover:text-danger",
  },
  // No monitoring data — still show the optimistic default with the link.
  unknown: {
    label: "All systems operational",
    dot: "bg-accent",
    ping: "bg-accent",
    text: "text-ink-faint hover:text-accent",
  },
};

/**
 * Live uptime pill for the marketing footer. Reads the cached /api/status
 * proxy (UptimeRobot) and links to the public status page.
 */
export function StatusIndicator({
  statusUrl = "https://www.envpilot.dev/api/status",
}: {
  statusUrl?: string;
} = {}) {
  const [status, setStatus] = useState<ServiceStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    fetch(statusUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { status?: ServiceStatus } | null) => {
        if (!cancelled && data?.status && data.status in STATUS_CONFIG) {
          setStatus(data.status);
        }
      })
      .catch(() => {
        // Network failure — keep the optimistic default
      });
    return () => {
      cancelled = true;
    };
  }, [statusUrl]);

  const config = STATUS_CONFIG[status];

  return (
    <a
      href={STATUS_PAGE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 font-mono text-xs transition-colors ${config.text}`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${config.ping}`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`}
        />
      </span>
      {config.label}
      <span className="text-ink-faint">·</span>
      <span className="underline-offset-4 hover:underline">status</span>
    </a>
  );
}
