/**
 * Project-related constants
 */

export const PROJECT_ICONS = [
  '📁', '🚀', '💻', '🌐', '📱', '🔧', '📦', '🎨', '⚡', '🔐', '📊', '🛠️'
] as const

export const PROJECT_COLORS = [
  '#f4f4f5', '#fee2e2', '#fef3c7', '#d1fae5', '#dbeafe', '#e0e7ff', '#fae8ff', '#fce7f3',
  '#f0fdf4', '#ecfeff', '#eff6ff', '#f5f3ff'
] as const

export const DEFAULT_PROJECT_ICON = '📁'
export const DEFAULT_PROJECT_COLOR = '#f4f4f5'

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const

export type ProjectIcon = typeof PROJECT_ICONS[number]
export type ProjectColor = typeof PROJECT_COLORS[number]
export type Environment = typeof ENVIRONMENTS[number]
