"use client";

import { Pie, PieChart, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";

const RESOURCE_COLORS: Record<string, string> = {
  variable: "var(--color-chart-1)",
  project: "var(--color-chart-2)",
  permission: "var(--color-chart-3)",
  organization: "var(--color-chart-4)",
  security: "var(--color-chart-5)",
  access_token: "hsl(217, 70%, 50%)",
  invitation: "hsl(180, 60%, 45%)",
  billing: "hsl(330, 65%, 55%)",
};

const RESOURCE_LABELS: Record<string, string> = {
  variable: "Variables",
  project: "Projects",
  permission: "Permissions",
  organization: "Organization",
  security: "Security",
  access_token: "Access Tokens",
  invitation: "Invitations",
  billing: "Billing",
};

interface ResourceBreakdownChartProps {
  resourceTypeCounts: Record<string, number>;
}

export function ResourceBreakdownChart({
  resourceTypeCounts,
}: ResourceBreakdownChartProps) {
  const data = Object.entries(resourceTypeCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      type,
      label: RESOURCE_LABELS[type] ?? type,
      count,
      fill: RESOURCE_COLORS[type] ?? "#71717a",
    }))
    .sort((a, b) => b.count - a.count);

  const chartConfig: ChartConfig = {};
  for (const item of data) {
    chartConfig[item.type] = {
      label: item.label,
      color: item.fill,
    };
  }

  return (
    <TerminalWindow title="resource-breakdown">
      <div className="border-b border-line px-5 py-2.5">
        <span className="font-mono text-xs text-ink-subtle">
          <span className="text-accent">$</span> envpilot analytics --resources
        </span>
      </div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="text-center text-xs text-ink-faint font-mono py-8">
            No resource data
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="type" />} />
              <Pie
                data={data}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                strokeWidth={2}
                stroke="var(--color-canvas)"
              >
                {data.map((entry) => (
                  <Cell key={entry.type} fill={entry.fill} />
                ))}
              </Pie>
              <ChartLegend
                content={<ChartLegendContent nameKey="type" payload={[]} />}
              />
            </PieChart>
          </ChartContainer>
        )}
      </div>
    </TerminalWindow>
  );
}
