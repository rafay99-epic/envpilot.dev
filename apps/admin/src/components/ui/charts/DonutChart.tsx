import { useState } from "react";
import { cn } from "@/lib/utils";
import { CHART_COLORS, formatCompact } from "./utils";

interface DonutChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutChartDatum[];
  size?: number;
  innerRadius?: number;
  showLegend?: boolean;
  showTotal?: boolean;
  totalLabel?: string;
  className?: string;
  formatValue?: (v: number) => string;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  data,
  size = 200,
  innerRadius = 0.6,
  showLegend = true,
  showTotal = true,
  totalLabel = "Total",
  className,
  formatValue = formatCompact,
}: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * innerRadius;

  let currentAngle = -Math.PI / 2; // Start at top

  const slices = data.map((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;
    return {
      ...d,
      index: i,
      startAngle,
      endAngle,
      color: d.color ?? CHART_COLORS[i % CHART_COLORS.length],
      percentage: ((d.value / total) * 100).toFixed(1),
    };
  });

  return (
    <div className={cn("flex items-center gap-6", className)}>
      <div className="relative flex-shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((slice) => (
            <path
              key={slice.index}
              d={arcPath(
                cx,
                cy,
                outerR,
                innerR,
                slice.startAngle,
                slice.endAngle
              )}
              fill={slice.color}
              stroke="#18181b"
              strokeWidth={2}
              opacity={hovered === null || hovered === slice.index ? 1 : 0.4}
              className="transition-opacity duration-150"
              onMouseEnter={() => setHovered(slice.index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        {showTotal && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-ink">
              {formatValue(total)}
            </span>
            <span className="text-xs text-ink-subtle">{totalLabel}</span>
          </div>
        )}
      </div>

      {showLegend && (
        <div className="space-y-2">
          {slices.map((slice) => (
            <div
              key={slice.index}
              className="flex items-center gap-2 text-sm"
              onMouseEnter={() => setHovered(slice.index)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-ink-muted">{slice.label}</span>
              <span className="ml-auto font-medium text-ink">
                {formatValue(slice.value)}
              </span>
              <span className="text-xs text-ink-subtle">{slice.percentage}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
