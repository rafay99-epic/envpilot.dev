/**
 * User-pickable colour ramp for tags and other coloured labels.
 *
 * Source of truth: `--color-swatch-1..12` in `packages/ui/src/theme.css`. The
 * hexes are duplicated here because these values are STORED (a tag row keeps
 * its own hex), so they have to survive outside CSS — keep the two in step.
 */
export const SWATCH_COLORS: string[] = [
  "#4ade80",
  "#60a5fa",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#fb923c",
  "#f472b6",
  "#818cf8",
  "#a3e635",
  "#2dd4bf",
  "#a1a1aa",
];

/** Default for anything that needs one before the user picks. */
export const DEFAULT_SWATCH_COLOR = "#a1a1aa";
