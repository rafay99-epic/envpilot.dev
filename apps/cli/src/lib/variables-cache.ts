/**
 * Fingerprint-gated cache for `envpilot run`.
 *
 * Strategy:
 *   FRESH  (age < TTL)         → serve from disk, zero API calls         (~5ms)
 *   STALE, fingerprint matches → extend cache, zero vault decryptions    (~30ms)
 *   STALE, fingerprint differs → full fetch (only when vars actually changed)
 *   MISS                       → full fetch, write cache                 (first run)
 *
 * The fingerprint is a hash of variable metadata (id + version + updatedAt)
 * computed server-side WITHOUT decrypting vault secrets. This eliminates the
 * expensive WorkOS Vault calls on every stale-cache check — vault decryption
 * only happens when variables have genuinely changed.
 *
 * Security: cache files are written with mode 0o600 (owner read/write only),
 * the same protection level as a .env file. Cache is keyed by a hash of
 * projectId + environment + organizationId + the first 16 chars of the access
 * token so that switching accounts or servers automatically invalidates entries.
 */

import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { Variable } from "../types/index.js";
import { getConfigPath, getApiUrl, getAccessToken } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CacheEntry {
  variables: Variable[];
  fetchedAt: number; // Unix ms
  projectId: string;
  environment: string;
  organizationId: string;
  apiUrl: string; // invalidated if server changes
  /**
   * Hash of variable metadata (id:version:updatedAt) at fetch time.
   * Used to avoid vault decryptions on stale-cache checks.
   * Optional for backwards compat with old cache files.
   */
  fingerprint?: string;
}

export type CacheResult =
  | { hit: true; fresh: true; entry: CacheEntry }
  | { hit: true; fresh: false; entry: CacheEntry }
  | { hit: false };

// ─── Paths ───────────────────────────────────────────────────────────────────

function getCacheDir(): string {
  return join(dirname(getConfigPath()), "run-cache");
}

function getCacheKey(
  projectId: string,
  environment: string,
  organizationId: string
): string {
  // Include a token slice so a different user / logout+login cycle misses.
  const tokenSlice = (getAccessToken() ?? "").slice(0, 16);
  return createHash("sha256")
    .update(`${projectId}:${environment}:${organizationId}:${tokenSlice}`)
    .digest("hex")
    .slice(0, 20);
}

function getCachePath(key: string): string {
  return join(getCacheDir(), `${key}.json`);
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

/**
 * Compute the fingerprint for a set of variables using the same formula
 * as the server-side `/api/cli/variables/fingerprint` endpoint.
 *
 * This lets the CLI compute the fingerprint from a freshly-fetched variable
 * list (for free, without an extra HTTP call) and store it alongside the
 * cached variables.
 */
export function computeFingerprint(variables: Variable[]): string {
  return createHash("sha256")
    .update(
      variables
        .map((v) => `${v._id}:${v.version ?? 0}:${v.updatedAt ?? 0}`)
        .sort()
        .join("|")
    )
    .digest("hex")
    .slice(0, 16);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read a cache entry. Returns the entry if present, null otherwise.
 * Automatically invalidates entries from a different API server.
 */
export function readCache(
  projectId: string,
  environment: string,
  organizationId: string
): CacheEntry | null {
  try {
    const key = getCacheKey(projectId, environment, organizationId);
    const path = getCachePath(key);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    // Invalidate if the API server changed.
    if (entry.apiUrl !== getApiUrl()) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Probe the cache and return a discriminated union so callers can branch
 * cleanly without recalculating freshness.
 */
export function probeCache(
  projectId: string,
  environment: string,
  organizationId: string,
  ttlSeconds: number
): CacheResult {
  const entry = readCache(projectId, environment, organizationId);
  if (!entry) return { hit: false };
  const fresh = isFresh(entry, ttlSeconds);
  return { hit: true, fresh, entry };
}

/**
 * Write variables to disk cache with restrictive permissions.
 * Automatically computes and stores the fingerprint so future stale checks
 * can avoid vault decryptions.
 *
 * Failures are silently swallowed — cache is a performance aid, not load-bearing.
 */
export function writeCache(
  projectId: string,
  environment: string,
  organizationId: string,
  variables: Variable[]
): void {
  try {
    const cacheDir = getCacheDir();
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    const key = getCacheKey(projectId, environment, organizationId);
    const path = getCachePath(key);
    const entry: CacheEntry = {
      variables,
      fetchedAt: Date.now(),
      projectId,
      environment,
      organizationId,
      apiUrl: getApiUrl(),
      fingerprint: computeFingerprint(variables),
    };
    writeFileSync(path, JSON.stringify(entry, null, 2), {
      encoding: "utf-8",
      mode: 0o600, // owner read/write only — same as .env
    });
  } catch {
    // Non-fatal — proceed without caching.
  }
}

/**
 * Extend the freshness of a cache entry without changing the variables.
 *
 * Called when a stale-cache fingerprint check confirms nothing has changed.
 * Updates `fetchedAt` to now so the TTL window resets — avoiding the next
 * fingerprint check for another full TTL period.
 *
 * Non-fatal if the cache file has been deleted in the meantime.
 */
export function extendCacheFreshness(
  projectId: string,
  environment: string,
  organizationId: string
): void {
  try {
    const key = getCacheKey(projectId, environment, organizationId);
    const path = getCachePath(key);
    if (!existsSync(path)) return;
    const raw = readFileSync(path, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    entry.fetchedAt = Date.now();
    writeFileSync(path, JSON.stringify(entry, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch {
    // Non-fatal.
  }
}

/**
 * Delete the cache entry for a specific project+env.
 */
export function deleteCache(
  projectId: string,
  environment: string,
  organizationId: string
): void {
  try {
    const key = getCacheKey(projectId, environment, organizationId);
    const path = getCachePath(key);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Ignore.
  }
}

/**
 * Purge all cache entries (e.g., after logout or explicit `envpilot cache clear`).
 */
export function clearAllCache(): number {
  let count = 0;
  try {
    const dir = getCacheDir();
    if (!existsSync(dir)) return 0;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        unlinkSync(join(dir, file));
        count++;
      } catch {
        // Ignore per-file errors.
      }
    }
  } catch {
    // Ignore.
  }
  return count;
}

/**
 * Return total number of cached entries and the directory path (for diagnostics).
 */
export function getCacheStats(): {
  count: number;
  dir: string;
  sizeBytes: number;
} {
  const dir = getCacheDir();
  let count = 0;
  let sizeBytes = 0;
  try {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        try {
          sizeBytes += statSync(join(dir, file)).size;
          count++;
        } catch {
          // Ignore.
        }
      }
    }
  } catch {
    // Ignore.
  }
  return { count, dir, sizeBytes };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isFresh(entry: CacheEntry, ttlSeconds: number): boolean {
  return Date.now() - entry.fetchedAt < ttlSeconds * 1000;
}

/** Human-readable cache age: "12s ago", "3m ago", "2h ago". */
export function formatAge(fetchedAt: number): string {
  const ageSec = Math.floor((Date.now() - fetchedAt) / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}
