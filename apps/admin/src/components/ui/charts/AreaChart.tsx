import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  scaleLinear,
  niceAxisTicks,
  formatCompact,
  pointsToSmoothPath,
  CHART_COLORS,
} from "./utils";

interface AreaChartDatum {
  label: string;
  value: number;
}

interface AreaChartSeries {
  data: AreaChartDatum[];
  color?: string;
  label?: string;
}

interface AreaChartProps {
  series: AreaChartSeries[];
  height?: number;
  showArea?: boolean;
  showDots?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
  formatValue?: (v: number) => string;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };
const VIEW_WIDTH = 500;

export function AreaChart({
  series,
  height = 240,
  showArea = true,
  showDots = true,
  showGrid = true,
  showLegend = true,
  className,
  formatValue = formatCompact,
}: AreaChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (series.length === 0 || series[0].data.length === 0) return null;

  const viewHeight = height;
  const chartW = VIEW_WIDTH - PADDING.left - PADDING.right;
  const chartH = viewHeight - PADDING.top - PADDING.bottom;

  const allValues = series.flatMap((s) => s.data.map((d) => d.value));
  const maxVal = Math.max(...allValues, 1);
  const ticks = niceAxisTicks(0, maxVal, 5);
  const yMax = ticks[ticks.length - 1];

  const labels = series[0].data.map((d) => d.label);
  const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW;

  function getPoints(data: AreaChartDatum[]) {
    return data.map((d, i) => ({
      x: PADDING.left + (labels.length > 1 ? i * xStep : chartW / 2),
      y: PADDING.top + chartH - scaleLinear(d.value, [0, yMax], [0, chartH]),
    }));
  }

  const baseline = PADDING.top + chartH;

  // Determine which x-axis labels to show (skip to avoid overlap)
  const maxLabels = Math.floor(chartW / 36);
  const labelSkip = Math.max(1, Math.ceil(labels.length / maxLabels));

  return (
    <div className={cn("relative", className)}>
      {showLegend && series.length > 1 && (
        <div className="mb-2 flex gap-4">
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    s.color ?? CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <span className="text-ink-muted">
                {s.label ?? `Series ${i + 1}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <svg
        width="100%"
        height={viewHeight}
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {series.map((s, i) => {
            const c = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
            return (
              <linearGradient
                key={i}
                id={`area-grad-${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={c} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Grid */}
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

        {/* X-axis labels */}
        {labels.map((label, i) => {
          if (i % labelSkip !== 0 && i !== labels.length - 1) return null;
          const x = PADDING.left + (labels.length > 1 ? i * xStep : chartW / 2);
          return (
            <text
              key={i}
              x={x}
              y={PADDING.top + chartH + 16}
              textAnchor="middle"
              className="fill-ink-subtle"
              fontSize={9}
            >
              {label}
            </text>
          );
        })}

        {/* Crosshair */}
        {hoveredIdx !== null && (
          <line
            x1={
              PADDING.left +
              (labels.length > 1 ? hoveredIdx * xStep : chartW / 2)
            }
            x2={
              PADDING.left +
              (labels.length > 1 ? hoveredIdx * xStep : chartW / 2)
            }
            y1={PADDING.top}
            y2={baseline}
            stroke="#3f3f46"
            strokeDasharray="4 4"
          />
        )}

        {/* Series */}
        {series.map((s, si) => {
          const points = getPoints(s.data);
          const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length];
          const linePath = pointsToSmoothPath(points);

          // Area path: line path + close to baseline
          const lastPt = points[points.length - 1];
          const firstPt = points[0];
          const areaPath = `${linePath} L ${lastPt.x} ${baseline} L ${firstPt.x} ${baseline} Z`;

          return (
            <g key={si}>
              {showArea && <path d={areaPath} fill={`url(#area-grad-${si})`} />}
              <path
                d={linePath}
                fill="none"
                stroke={c}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {showDots &&
                points.map((pt, i) => (
                  <g key={i}>
                    {/* Hit area */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={12}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredIdx === i ? 4 : 3}
                      fill={c}
                      stroke="#18181b"
                      strokeWidth={2}
                      className="transition-all duration-100"
                    />
                  </g>
                ))}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${((PADDING.left + (labels.length > 1 ? hoveredIdx * xStep : chartW / 2)) / VIEW_WIDTH) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
          }}
        >
          <p className="mb-1 font-medium text-ink-muted">{labels[hoveredIdx]}</p>
          {series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    s.color ?? CHART_COLORS[si % CHART_COLORS.length],
                }}
              />
              <span className="text-ink-muted">
                {s.label ?? `Series ${si + 1}`}:
              </span>
              <span className="font-medium text-ink">
                {formatValue(s.data[hoveredIdx]?.value ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
