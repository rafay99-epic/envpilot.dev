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
 * projectId + environment + organizationId + the ACTIVE ACCOUNT ID, so one
 * account can never be served another account's decrypted secrets.
 */

import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { Variable } from "../types/index.js";
import { getConfigPath, getApiUrl, getActiveAccountId } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CacheEntry {
  variables: Variable[];
  fetchedAt: number; // Unix ms — reset on every freshness extension
  /**
   * Unix ms of the ORIGINAL server fetch. Never advanced by
   * extendCacheFreshness, so it anchors the hard max-age ceiling: a cache
   * entry can never be served (or extended) past HARD_MAX_AGE_MS after its
   * first real fetch, no matter how many stale-check extensions occur.
   * Optional for backwards compat with old cache files (falls back to fetchedAt).
   */
  firstFetchedAt?: number;
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
  /**
   * Keys that failed vault decryption at fetch time (and were therefore NOT
   * cached). Stored so cache-served runs can repeat the warning instead of
   * silently omitting the keys. Optional for backwards compat.
   */
  decryptionFailures?: string[];
  /**
   * True when the server filtered the variable set to the caller's
   * environment scope. Stored so cache-served runs can repeat the notice.
   */
  scopeRestricted?: boolean;
  /**
   * The server's row cap when the read was capped, else undefined. A capped
   * set is short by an unknown amount, so it must keep reporting as such on
   * every cache-served run instead of looking complete after the first.
   */
  truncatedAt?: number;
  /**
   * Accessible keys that live only in OTHER environments, as of the last
   * server contact. Cached so the "not in this environment" notice survives a
   * cache hit: recomputing it would mean a network call on the one path whose
   * entire purpose is not making one.
   */
  foreignKeys?: Array<{ key: string; environments: string[] }>;
}

/**
 * Absolute ceiling on how long a cache entry may be served, measured from the
 * first real fetch (firstFetchedAt). Even if the server is unreachable and we
 * keep falling back to stale cache, once an entry is older than this we refuse
 * to serve it — forcing a fresh fetch (which fails loudly when offline) so that
 * revoked or rotated secrets can never be served indefinitely.
 */
export const HARD_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

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
  // Key on the account id, NOT a slice of the access token. Every RS256 JWT
  // begins with the same base64 header ("eyJhbGciOiJSUzI1..."), so a token
  // prefix carries zero account entropy and the old key was shared by every
  // user of a project. The account id is stable across token refresh.
  const accountId = getActiveAccountId() ?? "anonymous";
  return createHash("sha256")
    .update(`${projectId}:${environment}:${organizationId}:${accountId}`)
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
  // MUST stay byte-identical to apps/web/src/app/api/cli/variables/fingerprint
  // /route.ts: `${v._id}:${v.version}:${v.updatedAt}`, sorted, joined with "|",
  // sha256, first 16 hex chars. Do NOT coalesce version/updatedAt to 0 — the
  // server does not, and any divergence makes every stale check refetch.
  return createHash("sha256")
    .update(
      variables
        .map((v) => `${v._id}:${v.version}:${v.updatedAt}`)
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
    // Hard ceiling: never serve an entry older than HARD_MAX_AGE_MS since its
    // first fetch — delete it so a fresh fetch is forced (and fails loudly when
    // offline) rather than serving potentially-revoked secrets forever.
    if (!isWithinHardMaxAge(entry)) {
      try {
        unlinkSync(path);
      } catch {
        // Ignore — best effort cleanup.
      }
      return null;
    }
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
  variables: Variable[],
  /**
   * The fingerprint the server reported for this exact variable set, if we
   * happen to have it (e.g. the stale-path fingerprint check that triggered
   * this refetch). Stored verbatim so the next stale check is guaranteed to
   * match. When omitted, we compute it locally with the server-identical
   * formula.
   */
  serverFingerprint?: string,
  /** Fetch-time warnings to repeat on cache-served runs. */
  meta?: {
    decryptionFailures?: string[];
    scopeRestricted?: boolean;
    truncatedAt?: number;
    foreignKeys?: Array<{ key: string; environments: string[] }>;
  }
): void {
  try {
    const cacheDir = getCacheDir();
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    const key = getCacheKey(projectId, environment, organizationId);
    const path = getCachePath(key);
    const now = Date.now();
    const entry: CacheEntry = {
      variables,
      fetchedAt: now,
      firstFetchedAt: now,
      projectId,
      environment,
      organizationId,
      apiUrl: getApiUrl(),
      fingerprint: serverFingerprint ?? computeFingerprint(variables),
      ...(meta?.decryptionFailures?.length
        ? { decryptionFailures: meta.decryptionFailures }
        : {}),
      ...(meta?.scopeRestricted ? { scopeRestricted: true } : {}),
      ...(meta?.truncatedAt !== undefined
        ? { truncatedAt: meta.truncatedAt }
        : {}),
      ...(meta?.foreignKeys?.length ? { foreignKeys: meta.foreignKeys } : {}),
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
    // Never let a hot entry outlive the hard ceiling: if extending would push
    // this entry past HARD_MAX_AGE_MS since its first fetch, leave it stale so
    // the next run re-verifies (or, once fully expired, readCache deletes it).
    if (!isWithinHardMaxAge(entry)) return;
    // Anchor the hard-age ceiling to the earliest known fetch BEFORE advancing
    // fetchedAt, so old cache files (no firstFetchedAt) still get a real ceiling.
    if (entry.firstFetchedAt === undefined)
      entry.firstFetchedAt = entry.fetchedAt;
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
 * Delete the entire run-cache directory contents (all decrypted-secret cache
 * files). Called by config.clearAuth() on logout / account switch so a
 * different user can never be served another account's cached secrets, and
 * available as an explicit "wipe my local secret cache" primitive.
 *
 * Returns the number of cache files removed.
 */
export function clearRunCache(): number {
  const removed = clearAllCache();
  try {
    const dir = getCacheDir();
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmdirSync(dir);
    }
  } catch {
    // Non-fatal — an empty directory left behind is harmless.
  }
  return removed;
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
  // ttlSeconds === 0 means "never fresh" → always fingerprint-check.
  return Date.now() - entry.fetchedAt < ttlSeconds * 1000;
}

/**
 * Whether the entry is still within the absolute hard ceiling measured from its
 * first fetch. Old cache files without firstFetchedAt fall back to fetchedAt.
 */
export function isWithinHardMaxAge(entry: CacheEntry): boolean {
  const anchor = entry.firstFetchedAt ?? entry.fetchedAt;
  return Date.now() - anchor < HARD_MAX_AGE_MS;
}

/** Human-readable cache age: "12s ago", "3m ago", "2h ago". */
export function formatAge(fetchedAt: number): string {
  const ageSec = Math.floor((Date.now() - fetchedAt) / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}
