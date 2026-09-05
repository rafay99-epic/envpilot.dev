/**
 * Project-related constants
 */

import { DEFAULT_SWATCH_COLOR, SWATCH_COLORS } from "./swatches";

export const PROJECT_ICONS = [
  "folder",
  "globe",
  "smartphone",
  "server",
  "terminal",
  "database",
  "cloud",
  "package",
  "zap",
  "lock",
  "bar-chart-2",
  "rocket",
] as const;

/**
 * Project colours ARE the shared swatch ramp — one list, so a tag and a
 * project icon can never drift apart. See constants/swatches.ts.
 */
export const PROJECT_COLORS = SWATCH_COLORS;

export const DEFAULT_PROJECT_ICON = "folder";
export const DEFAULT_PROJECT_COLOR = DEFAULT_SWATCH_COLOR;

/**
 * Maps legacy emoji icons to their Lucide replacements.
 * Used for backward compatibility with existing projects in the database.
 */
export const LEGACY_ICON_MAP: Record<string, ProjectIcon> = {
  "📁": "folder",
  "🚀": "rocket",
  "💻": "terminal",
  "🌐": "globe",
  "📱": "smartphone",
  "🔧": "server",
  "📦": "package",
  "🎨": "cloud",
  "⚡": "zap",
  "🔐": "lock",
  "📊": "bar-chart-2",
  "🛠️": "database",
};

export const ENVIRONMENTS = ["development", "staging", "production"] as const;

/**
 * Classes for an environment toggle pill (variables, accounts, secret files).
 * One definition, because four hand-copied ternaries drift the moment any one
 * of them is touched.
 */
export function envToggleClasses(env: Environment, selected: boolean): string {
  if (!selected) {
    return "bg-surface-raised text-ink-muted hover:bg-surface-hover";
  }
  switch (env) {
    case "production":
      return "ring-1 bg-danger-soft text-danger ring-danger-line";
    case "staging":
      return "ring-1 bg-warning-soft text-warning ring-warning-line";
    default:
      return "ring-1 bg-accent-soft text-accent ring-accent-line";
  }
}

export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectColor = string;
export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * Narrows a default/initial environment selection to what the caller may
 * write. Falls back to the first allowed environment when the default (e.g.
 * "development") isn't one of them, so a scoped user never starts on an
 * environment they can't save.
 */
export function pickAllowedEnvironments(
  environments: readonly Environment[],
  allowed: readonly string[]
): Environment[] {
  const filtered = environments.filter((env) => allowed.includes(env));
  return filtered.length > 0 ? filtered : [allowed[0] as Environment];
}
