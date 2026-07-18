import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/**
 * Normalize a path for consistent storage and comparison across platforms.
 * Always uses forward slashes internally. Symlinks are resolved so two
 * spellings of the same file (e.g. /tmp vs /private/tmp on macOS) compare
 * equal, and the result is lowercased on the case-insensitive platforms
 * (darwin/win32) so casing differences can't bypass path-keyed guards.
 */
export function normalizePath(inputPath: string): string {
  // Resolve to absolute path
  let resolved = path.resolve(inputPath);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // File doesn't exist (yet) — lexical resolution is the best we can do.
  }
  // Convert to forward slashes for consistent storage
  let normalized = resolved.replace(/\\/g, "/");
  if (process.platform === "darwin" || process.platform === "win32") {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Convert normalized path back to platform-specific format
 */
export function toPlatformPath(normalizedPath: string): string {
  if (os.platform() === "win32") {
    return normalizedPath.replace(/\//g, "\\");
  }
  return normalizedPath;
}

/**
 * Check if two paths point to the same location
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2);
}

/**
 * Check if childPath is inside parentPath
 * Uses proper path segment comparison to prevent bypass attacks
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath);
  const normalizedParent = normalizePath(parentPath);

  // Ensure parent ends with separator for proper prefix matching
  const parentWithSep = normalizedParent.endsWith("/")
    ? normalizedParent
    : normalizedParent + "/";

  return (
    normalizedChild.startsWith(parentWithSep) ||
    normalizedChild === normalizedParent
  );
}

/**
 * Get a display-friendly path (relative to home if applicable)
 */
export function getDisplayPath(absolutePath: string): string {
  const homedir = os.homedir();
  const normalized = normalizePath(absolutePath);
  const normalizedHome = normalizePath(homedir);

  if (normalized.startsWith(normalizedHome + "/")) {
    return "~" + normalized.slice(normalizedHome.length);
  }
  return toPlatformPath(absolutePath);
}

/**
 * Generate a storage key from a path (base64 encoded for safe storage)
 */
export function pathToStorageKey(inputPath: string): string {
  return Buffer.from(normalizePath(inputPath)).toString("base64");
}
