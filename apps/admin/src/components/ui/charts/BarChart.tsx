import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  scaleLinear,
  niceAxisTicks,
  formatCompact,
  CHART_COLORS,
} from "./utils";

interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  color?: string;
  showValues?: boolean;
  showGrid?: boolean;
  className?: string;
  formatValue?: (v: number) => string;
}

const PADDING = { top: 20, right: 16, left: 44 };
const VIEW_WIDTH = 400;

export function BarChart({
  data,
  height = 220,
  color,
  showValues = true,
  showGrid = true,
  className,
  formatValue = formatCompact,
}: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  // Check if labels need rotation (more than 5 items or any label > 6 chars)
  const needsRotation = data.length > 5 || data.some((d) => d.label.length > 8);
  const bottomPadding = needsRotation ? 72 : 28;

  const viewHeight = height + (needsRotation ? 44 : 0);
  const chartW = VIEW_WIDTH - PADDING.left - PADDING.right;
  const chartH = viewHeight - PADDING.top - bottomPadding;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const ticks = niceAxisTicks(0, maxVal, 5);
  const yMax = ticks[ticks.length - 1];

  const barGap = Math.max(3, (chartW / data.length) * 0.15);
  const barWidth = Math.max(
    8,
    (chartW - barGap * (data.length - 1)) / data.length
  );

  return (
    <div className={cn("relative", className)}>
      <svg
        width="100%"
        height={viewHeight}
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {showGrid &&
          ticks.map((tick) => {
            const y =
              PADDING.top + chartH - scaleLinear(tick, [0, yMax], [0, chartH]);
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={VIEW_WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="#27272a"
                  strokeDasharray="4 4"
                />
                <text
                  x={PADDING.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-ink-subtle"
                  fontSize={10}
                >
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = scaleLinear(d.value, [0, yMax], [0, chartH]);
          const x = PADDING.left + i * (barWidth + barGap);
          const y = PADDING.top + chartH - barH;
          const barColor =
            d.color ?? color ?? CHART_COLORS[i % CHART_COLORS.length];
          const isHovered = hovered === i;
          const labelX = x + barWidth / 2;
          const labelY = PADDING.top + chartH + 12;

          return (
            <g
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 1)}
                fill={barColor}
                rx={3}
                opacity={isHovered ? 1 : 0.85}
                className="transition-opacity duration-150"
              />
              {/* Value label */}
              {showValues && d.value > 0 && (
                <text
                  x={labelX}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-ink-muted"
                  fontSize={10}
                  fontWeight={500}
                >
                  {formatValue(d.value)}
                </text>
              )}
              {/* X-axis label */}
              {needsRotation ? (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="end"
                  className="fill-ink-muted"
                  fontSize={10}
                  transform={`rotate(-45, ${labelX}, ${labelY})`}
                >
                  {d.label.length > 16 ? d.label.slice(0, 14) + "…" : d.label}
                </text>
              ) : (
                <text
                  x={labelX}
                  y={labelY + 4}
                  textAnchor="middle"
                  className="fill-ink-muted"
                  fontSize={10}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered !== null && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-surface px-3 py-1.5 text-xs shadow-xl"
          style={{
            left: `${((PADDING.left + hovered * (barWidth + barGap) + barWidth / 2) / VIEW_WIDTH) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-medium text-ink">
            {formatValue(data[hovered].value)}
          </p>
          <p className="text-ink-muted">{data[hovered].label}</p>
        </div>
      )}
    </div>
  );
}
