import * as path from "path";
import * as os from "os";

/**
 * Normalize a path for consistent storage across platforms
 * Always uses forward slashes internally
 */
export function normalizePath(inputPath: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(inputPath);
  // Convert to forward slashes for consistent storage
  return resolved.replace(/\\/g, "/");
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
