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
  eventCount: {
    label: "Events",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface ProjectActivityChartProps {
  data: Array<{ projectName: string; eventCount: number }>;
}

export function ProjectActivityChart({ data }: ProjectActivityChartProps) {
  return (
    <TerminalWindow title="most-active-projects">
      <div className="border-b border-zinc-700/50 px-5 py-2.5">
        <span className="font-mono text-xs text-zinc-500">
          <span className="text-green-400">$</span> envpilot analytics
          --projects --top=10
        </span>
      </div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="text-center text-xs text-zinc-600 font-mono py-8">
            No project activity data
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: Math.max(200, data.length * 40) }}
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#27272a"
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
                dataKey="projectName"
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
                dataKey="eventCount"
                fill="hsl(var(--chart-1))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </TerminalWindow>
  );
}
