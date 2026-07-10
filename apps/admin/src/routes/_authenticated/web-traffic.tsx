import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card, StatCard } from "@/components/ui/Card";
import { AreaChart } from "@/components/ui/charts";
import { Spinner } from "@/components/ui/Spinner";
import {
  Globe,
  Eye,
  Users,
  MousePointerClick,
  TrendingDown,
  RefreshCw,
  AlertCircle,
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

function WebTrafficPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [chartData, setChartData] = useState<PageviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const fetchShareUrl = useAdminAction(
    api.features.admin.analytics.getShareUrl
  );
  const fetchStats = useAdminAction(
    api.features.admin.analytics.getWebTrafficStats
  );
  const fetchPageviews = useAdminAction(
    api.features.admin.analytics.getWebTrafficPageviews
  );

  // Store action refs in refs to avoid infinite useEffect loops
  const fetchStatsRef = useRef(fetchStats);
  fetchStatsRef.current = fetchStats;
  const fetchPageviewsRef = useRef(fetchPageviews);
  fetchPageviewsRef.current = fetchPageviews;
  const fetchShareUrlRef = useRef(fetchShareUrl);
  fetchShareUrlRef.current = fetchShareUrl;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, url] = await Promise.all([
        fetchStatsRef.current({}),
        fetchPageviewsRef.current({ range }),
        fetchShareUrlRef.current({}),
      ]);
      setStats(s as TrafficStats);
      setChartData(p as PageviewData);
      if (url) setShareUrl(url as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ranges: { key: TimeRange; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
  ];

  // Build chart series from API data
  const chartSeries =
    chartData && chartData.pageviews.length > 0
      ? [
          {
            label: "Pageviews",
            color: "#10b981",
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

  // Error state — likely env vars not configured
  if (error && !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Web Traffic</h1>
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-zinc-200">
              Analytics not configured
            </p>
            <p className="mt-1 max-w-md text-sm text-zinc-500">
              {error.includes("not configured") ? (
                <>
                  Set the following Convex environment variables:
                  <br />
                  <code className="mt-2 block rounded bg-zinc-800 p-2 text-xs text-emerald-400">
                    npx convex env set UMAMI_API_KEY your-api-key
                    <br />
                    npx convex env set UMAMI_WEBSITE_ID your-website-id
                    <br />
                    npx convex env set UMAMI_SHARE_URL your-share-url
                  </code>
                </>
              ) : (
                error
              )}
            </p>
          </div>
          <button
            onClick={loadData}
            className="mt-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Web Traffic</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <div className="flex rounded-md border border-zinc-700 bg-zinc-800">
            {ranges.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  range === r.key
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      {loading && !stats ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Active Visitors"
              value={stats.activeVisitors ?? 0}
              icon={
                <div className="relative">
                  <Eye className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-900">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
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

          {/* Chart */}
          {chartSeries.length > 0 && (
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-300">
                  Pageviews & Sessions
                </h2>
              </div>
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

          {/* Error banner if refresh failed but we have stale data */}
          {error && (
            <div className="rounded-md border border-amber-600/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-400">
              Failed to refresh: {error}
            </div>
          )}
        </>
      ) : null}

      {/* Umami Share Dashboard Link */}
      {shareUrl && (
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-medium text-zinc-200">
                Detailed Analytics
              </h2>
              <p className="text-xs text-zinc-500">
                View the full Umami analytics dashboard
              </p>
            </div>
          </div>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Open Dashboard
          </a>
        </Card>
      )}
    </div>
  );
}
