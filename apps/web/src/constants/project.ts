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

export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
