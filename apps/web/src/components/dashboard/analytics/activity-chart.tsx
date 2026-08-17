"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";
import { formatDateWith } from "@/lib/format";

// Buckets are keyed by UTC day, so ticks are parsed and rendered in UTC and
// never land a day off for the reader's zone.
const formatDate = (value: string) =>
  formatDateWith(`${value}T00:00:00Z`, { month: "short", day: "numeric" });

const chartConfig = {
  count: {
    label: "Events",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

interface ActivityChartProps {
  dailyCounts: Record<string, number>;
  daysBack: number;
}

export function ActivityChart({ dailyCounts, daysBack }: ActivityChartProps) {
  // Fill in missing days with zero
  const data: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    data.push({
      date: key,
      count: dailyCounts[key] ?? 0,
    });
  }

  return (
    <TerminalWindow title="activity-overview">
      <div className="border-b border-line px-5 py-2.5">
        <span className="font-mono text-xs text-ink-subtle">
          <span className="text-accent">$</span> envpilot analytics --activity
          --days={daysBack}
        </span>
      </div>
      <div className="p-5">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillActivity" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-line-strong)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={35}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatDate(value as string)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#fillActivity)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </TerminalWindow>
  );
}
