import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { isFileWritable, type ProjectAccess } from "./roles.js";

// Re-export so command callers can build a ProjectAccess and pass it straight
// into applyFileProtection without importing roles.ts separately.
export type { ProjectAccess } from "./roles.js";

/**
 * Parse a .env file content into a key-value object
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Find the first equals sign
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    // Strip an optional leading `export ` prefix (`export FOO=bar`) so shell
    // dotenv files parse instead of being silently dropped by key validation.
    const key = line
      .substring(0, equalsIndex)
      .trim()
      .replace(/^export\s+/, "");
    let value = line.substring(equalsIndex + 1);

    // Handle quoted values
    value = parseValue(value);

    // Validate key format
    if (isValidEnvKey(key)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Parse a value, handling quotes and escapes
 */
function parseValue(value: string): string {
  value = value.trim();

  // Quoted value (double or single). Read up to the matching closing quote so
  // that a trailing inline comment — e.g. KEY="value" # comment — is dropped
  // rather than left glued onto the value. Double quotes process escapes;
  // single quotes are literal.
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const closingIndex = value.indexOf(quote, 1);
    if (closingIndex !== -1) {
      const inner = value.slice(1, closingIndex);
      if (quote === '"') {
        return inner
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
      return inner;
    }
    // No closing quote — fall through and treat as an unquoted value.
  }

  // Unquoted value — strip a trailing inline comment (` #...`).
  const commentIndex = value.indexOf(" #");
  if (commentIndex !== -1) {
    value = value.substring(0, commentIndex).trim();
  }

  return value;
}

/**
 * Validate an environment variable key
 */
export function isValidEnvKey(key: string): boolean {
  // Must start with a letter or underscore, followed by letters, numbers, or underscores
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Convert a key-value object to .env file format
 */
export function stringifyEnv(
  vars: Record<string, string>,
  options?: {
    sort?: boolean;
    comments?: Record<string, string>;
  }
): string {
  let keys = Object.keys(vars);

  if (options?.sort) {
    keys = keys.sort();
  }

  const lines: string[] = [];

  for (const key of keys) {
    const value = vars[key];

    // Add comment if provided
    if (options?.comments?.[key]) {
      lines.push(`# ${options.comments[key]}`);
    }

    // Determine if value needs quoting
    const formattedValue = formatValue(value);
    lines.push(`${key}=${formattedValue}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Format a value for .env file
 */
function formatValue(value: string): string {
  // Check if value needs quoting
  const needsQuotes =
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes(" ") ||
    value.includes("#") ||
    value.startsWith(" ") ||
    value.endsWith(" ");

  if (!needsQuotes) {
    return value;
  }

  // Escape special characters and wrap in double quotes
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

  return `"${escaped}"`;
}

/**
 * Merge two sets of environment variables
 */
export function mergeEnvVars(
  base: Record<string, string>,
  updates: Record<string, string>
): Record<string, string> {
  return { ...base, ...updates };
}

/**
 * Compute the diff between two sets of environment variables
 */
export function diffEnvVars(
  local: Record<string, string>,
  remote: Record<string, string>
): {
  added: Record<string, string>;
  removed: Record<string, string>;
  changed: Record<string, { local: string; remote: string }>;
  unchanged: string[];
} {
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { local: string; remote: string }> = {};
  const unchanged: string[] = [];

  // Find added and changed
  for (const [key, value] of Object.entries(local)) {
    if (!(key in remote)) {
      added[key] = value;
    } else if (remote[key] !== value) {
      changed[key] = { local: value, remote: remote[key] };
    } else {
      unchanged.push(key);
    }
  }

  // Find removed
  for (const [key, value] of Object.entries(remote)) {
    if (!(key in local)) {
      removed[key] = value;
    }
  }

  return { added, removed, changed, unchanged };
}

/**
 * Read a .env file from disk
 */
export function readEnvFile(filePath: string): Record<string, string> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf-8");
  return parseEnvFile(content);
}

/**
 * Atomically write a file: write a sibling temp file (with the requested mode)
 * then rename it into place. renameSync is atomic within a filesystem, so a
 * crash mid-write can never leave a truncated/partial .env on disk. The temp
 * file is created with the target mode so the secret is never briefly exposed
 * with default (world-readable) permissions.
 */
function atomicWriteFileSync(
  filePath: string,
  content: string,
  mode: number
): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmpPath, content, { encoding: "utf-8", mode });
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of the temp file if the rename never happened.
    try {
      if (existsSync(tmpPath)) chmodSync(tmpPath, 0o600);
    } catch {
      // Ignore.
    }
    throw err;
  }
}

/**
 * Write a .env file to disk.
 *
 * The file is created owner-only (0o600) so secrets are never world-readable
 * from the moment of creation, and the write is atomic (temp file + rename).
 */
export function writeEnvFile(
  filePath: string,
  vars: Record<string, string>,
  options?: {
    sort?: boolean;
    comments?: Record<string, string>;
  }
): void {
  const content = stringifyEnv(vars, options);
  atomicWriteFileSync(filePath, content, 0o600);
}

/**
 * Get the default .env file path
 */
export function getDefaultEnvPath(directory: string = process.cwd()): string {
  return join(directory, ".env.local");
}

/**
 * Get .env file path for a specific environment
 */
export function getEnvPathForEnvironment(
  environment: string,
  directory: string = process.cwd()
): string {
  if (environment === "development") {
    return join(directory, ".env.local");
  }
  return join(directory, `.env.${environment}`);
}

/**
 * Apply access-based file protection to a pulled .env file.
 *
 * Permissions are always OWNER-ONLY — a .env holds decrypted secrets and must
 * never be group/world readable (0o644/0o444 would leak secrets to every user
 * on the box). We only vary the owner's write bit:
 *
 *   protection === "never"  → 0o600  (owner read/write — force writable)
 *   protection === "always" → 0o400  (owner read-only — force read-only)
 *   protection === "auto"   → 0o600 when the caller can write the variables
 *                             (isFileWritable), else 0o400
 */
export function applyFileProtection(
  filePath: string,
  access: ProjectAccess,
  protection: "auto" | "always" | "never" = "auto"
): void {
  if (!existsSync(filePath)) return;

  if (protection === "never") {
    chmodSync(filePath, 0o600); // owner read/write
    return;
  }

  if (protection === "always") {
    chmodSync(filePath, 0o400); // owner read-only
    return;
  }

  // auto — derive from the caller's resolved access.
  chmodSync(filePath, isFileWritable(access) ? 0o600 : 0o400);
}
