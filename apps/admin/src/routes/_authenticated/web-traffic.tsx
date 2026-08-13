import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { ConvexError } from "convex/values";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card, StatCard } from "@/components/ui/Card";
import { AreaChart } from "@/components/ui/charts";
import { QueryState } from "@/components/ui/QueryState";
import { Button } from "@/components/ui/Button";
import {
  Globe,
  Eye,
  MousePointerClick,
  Users,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/web-traffic")({
  component: WebTrafficPage,
});

type TimeRange = "today" | "7d" | "30d";

interface TrafficStats {
  activeVisitors: number;
  pageviews: number;
  visitors: number;
  visits: number;
  bounceRate: number;
  yesterday: {
    pageviews: number;
    visitors: number;
    bounceRate: number;
  };
}

interface PageviewData {
  pageviews: Array<{ x: string; y: number }>;
  sessions: Array<{ x: string; y: number }>;
}

interface TrafficData {
  stats: TrafficStats;
  chartData: PageviewData;
  shareUrl: string | null;
}

function formatTrend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatLabel(dateStr: string, range: TimeRange): string {
  try {
    const d = new Date(dateStr);
    if (range === "today") return format(d, "HH:mm");
    if (range === "7d") return format(d, "EEE");
    return format(d, "MMM d");
  } catch {
    return dateStr;
  }
}

const ranges: { key: TimeRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

function WebTrafficPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [data, setData] = useState<TrafficData | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  // useAdminAction re-exports Convex's useAction, whose returned function is
  // stable across renders — no ref workaround needed to keep loadData stable.
  const fetchStats = useAdminAction(
    api.features.admin.analytics.getWebTrafficStats
  );
  const fetchPageviews = useAdminAction(
    api.features.admin.analytics.getWebTrafficPageviews
  );
  const fetchShareUrl = useAdminAction(
    api.features.admin.analytics.getShareUrl
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const [stats, chartData, shareUrl] = await Promise.all([
        fetchStats({}),
        fetchPageviews({ range }),
        fetchShareUrl({}),
      ]);
      setData({
        stats: stats as TrafficStats,
        chartData: chartData as PageviewData,
        shareUrl: (shareUrl as string) ?? null,
      });
    } catch (err) {
      // ConvexError payload survives prod redaction; plain Error does not.
      const msg =
        err instanceof ConvexError
          ? String(err.data)
          : err instanceof Error
            ? err.message
            : "Failed to load data";
      if (msg.includes("not configured")) {
        setNotConfigured(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [range, fetchStats, fetchPageviews, fetchShareUrl]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Web Traffic</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <div className="flex rounded-md border border-line bg-surface-raised">
            {ranges.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  range === r.key
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <QueryState
          data={data}
          error={error}
          onRetry={loadData}
          notConfigured={
            notConfigured
              ? {
                  envVar: "UMAMI_API_KEY",
                  hint: "Also set UMAMI_WEBSITE_ID and UMAMI_SHARE_URL: npx convex env set UMAMI_API_KEY / UMAMI_WEBSITE_ID / UMAMI_SHARE_URL",
                }
              : undefined
          }
        >
          {({ stats, chartData, shareUrl }) => {
            const chartSeries =
              chartData.pageviews.length > 0
                ? [
                    {
                      label: "Pageviews",
                      color: "#22c55e",
                      data: chartData.pageviews.map((p) => ({
                        label: formatLabel(p.x, range),
                        value: p.y,
                      })),
                    },
                    {
                      label: "Sessions",
                      color: "#3b82f6",
                      data: chartData.sessions.map((s) => ({
                        label: formatLabel(s.x, range),
                        value: s.y,
                      })),
                    },
                  ]
                : [];

            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="Active Visitors"
                    value={stats.activeVisitors ?? 0}
                    icon={
                      <div className="relative">
                        <Eye className="h-5 w-5" />
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-line">
                          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-75" />
                        </span>
                      </div>
                    }
                    trend="Live"
                  />
                  <StatCard
                    title="Pageviews"
                    value={(stats.pageviews ?? 0).toLocaleString()}
                    icon={<MousePointerClick className="h-5 w-5" />}
                    trend={`vs yesterday: ${formatTrend(stats.pageviews ?? 0, stats.yesterday?.pageviews ?? 0)}`}
                  />
                  <StatCard
                    title="Unique Visitors"
                    value={(stats.visitors ?? 0).toLocaleString()}
                    icon={<Users className="h-5 w-5" />}
                    trend={`vs yesterday: ${formatTrend(stats.visitors ?? 0, stats.yesterday?.visitors ?? 0)}`}
                  />
                  <StatCard
                    title="Bounce Rate"
                    value={`${stats.bounceRate ?? 0}%`}
                    icon={<TrendingDown className="h-5 w-5" />}
                    trend={`vs yesterday: ${stats.yesterday?.bounceRate ?? 0}%`}
                  />
                </div>

                {chartSeries.length > 0 && (
                  <Card title="Pageviews & Sessions">
                    <AreaChart
                      series={chartSeries}
                      height={280}
                      showArea
                      showDots
                      showGrid
                      showLegend
                    />
                  </Card>
                )}

                {shareUrl && (
                  <Card className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-accent" />
                      <div>
                        <h2 className="text-sm font-medium text-ink">
                          Detailed Analytics
                        </h2>
                        <p className="text-xs text-ink-subtle">
                          View the full Umami analytics dashboard
                        </p>
                      </div>
                    </div>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="default" size="sm">
                        Open Dashboard
                      </Button>
                    </a>
                  </Card>
                )}
              </div>
            );
          }}
        </QueryState>
      </Card>
    </div>
  );
}
