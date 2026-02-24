import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Parse a .env file content into a key-value object
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // Find the first equals sign
    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) {
      continue
    }

    const key = line.substring(0, equalsIndex).trim()
    let value = line.substring(equalsIndex + 1)

    // Handle quoted values
    value = parseValue(value)

    // Validate key format
    if (isValidEnvKey(key)) {
      result[key] = value
    }
  }

  return result
}

/**
 * Parse a value, handling quotes and escapes
 */
function parseValue(value: string): string {
  value = value.trim()

  // Handle double-quoted strings
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
    // Unescape common escape sequences
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  // Handle single-quoted strings (no escape processing)
  else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1)
  }
  // Handle inline comments for unquoted values
  else {
    const commentIndex = value.indexOf(' #')
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim()
    }
  }

  return value
}

/**
 * Validate an environment variable key
 */
export function isValidEnvKey(key: string): boolean {
  // Must start with a letter or underscore, followed by letters, numbers, or underscores
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}

/**
 * Convert a key-value object to .env file format
 */
export function stringifyEnv(
  vars: Record<string, string>,
  options?: {
    sort?: boolean
    comments?: Record<string, string>
  }
): string {
  let keys = Object.keys(vars)

  if (options?.sort) {
    keys = keys.sort()
  }

  const lines: string[] = []

  for (const key of keys) {
    const value = vars[key]

    // Add comment if provided
    if (options?.comments?.[key]) {
      lines.push(`# ${options.comments[key]}`)
    }

    // Determine if value needs quoting
    const formattedValue = formatValue(value)
    lines.push(`${key}=${formattedValue}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Format a value for .env file
 */
function formatValue(value: string): string {
  // Check if value needs quoting
  const needsQuotes =
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes(' ') ||
    value.includes('#') ||
    value.startsWith(' ') ||
    value.endsWith(' ')

  if (!needsQuotes) {
    return value
  }

  // Escape special characters and wrap in double quotes
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')

  return `"${escaped}"`
}

/**
 * Merge two sets of environment variables
 */
export function mergeEnvVars(
  base: Record<string, string>,
  updates: Record<string, string>
): Record<string, string> {
  return { ...base, ...updates }
}

/**
 * Compute the diff between two sets of environment variables
 */
export function diffEnvVars(
  local: Record<string, string>,
  remote: Record<string, string>
): {
  added: Record<string, string>
  removed: Record<string, string>
  changed: Record<string, { local: string; remote: string }>
  unchanged: string[]
} {
  const added: Record<string, string> = {}
  const removed: Record<string, string> = {}
  const changed: Record<string, { local: string; remote: string }> = {}
  const unchanged: string[] = []

  // Find added and changed
  for (const [key, value] of Object.entries(local)) {
    if (!(key in remote)) {
      added[key] = value
    } else if (remote[key] !== value) {
      changed[key] = { local: value, remote: remote[key] }
    } else {
      unchanged.push(key)
    }
  }

  // Find removed
  for (const [key, value] of Object.entries(remote)) {
    if (!(key in local)) {
      removed[key] = value
    }
  }

  return { added, removed, changed, unchanged }
}

/**
 * Read a .env file from disk
 */
export function readEnvFile(filePath: string): Record<string, string> | null {
  if (!existsSync(filePath)) {
    return null
  }

  const content = readFileSync(filePath, 'utf-8')
  return parseEnvFile(content)
}

/**
 * Write a .env file to disk
 */
export function writeEnvFile(
  filePath: string,
  vars: Record<string, string>,
  options?: {
    sort?: boolean
    comments?: Record<string, string>
  }
): void {
  const content = stringifyEnv(vars, options)
  writeFileSync(filePath, content, 'utf-8')
}

/**
 * Get the default .env file path
 */
export function getDefaultEnvPath(directory: string = process.cwd()): string {
  return join(directory, '.env')
}

/**
 * Get .env file path for a specific environment
 */
export function getEnvPathForEnvironment(
  environment: string,
  directory: string = process.cwd()
): string {
  if (environment === 'development') {
    return join(directory, '.env')
  }
  return join(directory, `.env.${environment}`)
}
