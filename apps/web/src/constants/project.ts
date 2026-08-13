/**
 * Project-related constants
 */

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

export const PROJECT_COLORS = [
  "#f4f4f5",
  "#fee2e2",
  "#fef3c7",
  "#d1fae5",
  "#dbeafe",
  "#e0e7ff",
  "#fae8ff",
  "#fce7f3",
  "#f0fdf4",
  "#ecfeff",
  "#eff6ff",
  "#f5f3ff",
] as const;

export const DEFAULT_PROJECT_ICON = "folder";
export const DEFAULT_PROJECT_COLOR = "#f4f4f5";

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
    return "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover";
  }
  switch (env) {
    case "production":
      return "bg-danger-soft text-danger ring-1 ring-danger-line bg-danger-soft text-danger ring-danger-line";
    case "staging":
      return "bg-warning-soft text-warning ring-1 ring-warning-line bg-warning-soft text-warning ring-warning-line";
    default:
      return "bg-accent-soft text-accent-hover ring-1 ring-accent-line bg-accent-soft text-accent ring-accent-line";
  }
}

export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
