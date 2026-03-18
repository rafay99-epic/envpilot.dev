export const CHART_COLORS = [
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#a855f7", // purple-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
];

export function scaleLinear(
  value: number,
  domain: [number, number],
  range: [number, number]
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return r0;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

export function niceAxisTicks(min: number, max: number, count = 5): number[] {
  if (max === min) return [min];
  const range = max - min;
  const roughStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let t = niceMin; t <= max + niceStep * 0.5; t += niceStep) {
    ticks.push(Math.round(t * 1e6) / 1e6);
  }
  return ticks;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function pointsToLinePath(
  points: Array<{ x: number; y: number }>
): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

export function pointsToSmoothPath(
  points: Array<{ x: number; y: number }>
): string {
  if (points.length < 2) return pointsToLinePath(points);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
