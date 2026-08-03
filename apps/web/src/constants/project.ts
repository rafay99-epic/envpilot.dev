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
    return "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700";
  }
  switch (env) {
    case "production":
      return "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700";
    case "staging":
      return "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-700";
    default:
      return "bg-green-100 text-green-700 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700";
  }
}

export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
