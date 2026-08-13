"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";

const chartConfig = {
  created: {
    label: "Created",
    color: "hsl(var(--chart-1))",
  },
  updated: {
    label: "Updated",
    color: "hsl(var(--chart-3))",
  },
  deleted: {
    label: "Deleted",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

interface VariableChangesChartProps {
  data: Array<{
    projectName: string;
    created: number;
    updated: number;
    deleted: number;
  }>;
}

export function VariableChangesChart({ data }: VariableChangesChartProps) {
  return (
    <TerminalWindow title="variable-changes">
      <div className="border-b border-line px-5 py-2.5">
        <span className="font-mono text-xs text-ink-subtle">
          <span className="text-accent">$</span> envpilot analytics
          --variable-changes
        </span>
      </div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="text-center text-xs text-ink-faint font-mono py-8">
            No variable change data
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: Math.max(200, data.length * 40 + 40) }}
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
              <ChartLegend content={<ChartLegendContent payload={[]} />} />
              <Bar
                dataKey="created"
                stackId="a"
                fill="hsl(var(--chart-1))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="updated"
                stackId="a"
                fill="hsl(var(--chart-3))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="deleted"
                stackId="a"
                fill="hsl(var(--chart-5))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </TerminalWindow>
  );
}
