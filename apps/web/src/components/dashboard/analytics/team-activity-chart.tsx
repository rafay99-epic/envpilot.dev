"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";

const chartConfig = {
  actionCount: {
    label: "Actions",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

interface TeamActivityChartProps {
  users: Array<{
    name: string;
    email: string;
    actionCount: number;
  }>;
}

export function TeamActivityChart({ users }: TeamActivityChartProps) {
  const data = users.map((u) => ({
    name: u.name || u.email,
    actionCount: u.actionCount,
  }));

  return (
    <TerminalWindow title="team-activity">
      <div className="border-b border-line px-5 py-2.5">
        <span className="font-mono text-xs text-ink-subtle">
          <span className="text-accent">$</span> envpilot analytics --team
          --top=5
        </span>
      </div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="text-center text-xs text-ink-faint font-mono py-8">
            No team activity data
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: Math.max(200, data.length * 44) }}
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-line-strong)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{
                  fill: "#71717a",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{
                  fill: "#a1a1aa",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="actionCount"
                fill="var(--color-chart-1)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </TerminalWindow>
  );
}
