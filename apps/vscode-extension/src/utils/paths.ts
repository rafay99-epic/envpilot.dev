import * as path from "path";
import * as os from "os";
import * as fs from "fs";

const realpathCache = new Map<string, string>();

function resolveRealPath(absPath: string): string {
  const cached = realpathCache.get(absPath);
  if (cached !== undefined) return cached;
  try {
    const real = fs.realpathSync(absPath);
    realpathCache.set(absPath, real);
    if (realpathCache.size > 500) {
      const [oldest] = realpathCache.keys();
      realpathCache.delete(oldest);
    }
    return real;
  } catch {
    const parent = path.dirname(absPath);
    if (parent === absPath) return absPath;
    return path.join(resolveRealPath(parent), path.basename(absPath));
  }
}

export function normalizePath(inputPath: string): string {
  const resolved = resolveRealPath(path.resolve(inputPath));
  return resolved.replace(/\\/g, "/");
}

export function pathKey(inputPath: string): string {
  const normalized = normalizePath(inputPath);
  return process.platform === "darwin" || process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

export function toPlatformPath(normalizedPath: string): string {
  if (os.platform() === "win32") {
    return normalizedPath.replace(/\//g, "\\");
  }
  return normalizedPath;
}

export function pathsEqual(path1: string, path2: string): boolean {
  return pathKey(path1) === pathKey(path2);
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const normalizedChild = pathKey(childPath);
  const normalizedParent = pathKey(parentPath);

  const parentWithSep = normalizedParent.endsWith("/")
    ? normalizedParent
    : normalizedParent + "/";

  return (
    normalizedChild.startsWith(parentWithSep) ||
    normalizedChild === normalizedParent
  );
}

export function getDisplayPath(absolutePath: string): string {
  const homedir = os.homedir();
  const normalized = normalizePath(absolutePath);
  const normalizedHome = normalizePath(homedir);

  if (normalized.startsWith(normalizedHome + "/")) {
    return "~" + normalized.slice(normalizedHome.length);
  }
  return toPlatformPath(absolutePath);
}

export function pathToStorageKey(inputPath: string): string {
  return Buffer.from(normalizePath(inputPath)).toString("base64");
}
