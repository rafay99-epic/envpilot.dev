/**
 * The one path from "a linked project" to "the secrets for an environment".
 *
 * `run` and `pull` each used to carry their own copy of this pipeline, which
 * is why they disagreed about warnings and truncation. Everything that needs
 * secret values goes through here now, so a condition reported by `doctor` is
 * by construction the same condition `run` refuses to start on.
 */

import chalk from "chalk";
import { createAPIClient, type FingerprintCheck } from "../api.js";
import { isConnectivityError } from "../errors.js";
import { withSpinner, warning } from "../ui.js";
import {
  type CacheEntry,
  probeCache,
  writeCache,
  extendCacheFreshness,
  deleteCache,
  formatAge,
} from "../variables-cache.js";
import type { Variable } from "../../types/index.js";
import type { Problem, ForeignKey } from "./problems.js";

export interface ResolveOptions {
  projectId: string;
  projectName: string;
  environment: string;
  organizationId: string;
  /** false = bypass the cache entirely (`--no-cache`). */
  useCache: boolean;
  /** Seconds a cache entry is served without even a fingerprint check. */
  ttlSeconds: number;
  quiet?: boolean;
}

export interface ResolvedSecrets {
  values: Map<string, string>;
  problems: Problem[];
  fromCache: boolean;
  /** Human-readable cache age, empty when the values were fetched fresh. */
  cacheAge: string;
}

export async function resolveSecrets(
  options: ResolveOptions
): Promise<ResolvedSecrets> {
  const fetched = await loadVariables(options);

  const problems: Problem[] = [];
  if (fetched.decryptionFailures.length > 0) {
    problems.push({
      kind: "decrypt-failed",
      keys: fetched.decryptionFailures,
    });
  }
  if (fetched.truncatedAt !== undefined) {
    problems.push({ kind: "truncated", limit: fetched.truncatedAt });
  }
  if (fetched.scopeRestricted) {
    problems.push({ kind: "scope-restricted" });
  }
  if (fetched.foreignKeys.length > 0) {
    problems.push({ kind: "other-environments", keys: fetched.foreignKeys });
  }

  return {
    values: new Map(fetched.variables.map((v) => [v.key, v.value])),
    problems,
    fromCache: fetched.fromCache,
    cacheAge: fetched.cacheAge,
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

interface LoadResult {
  variables: Variable[];
  decryptionFailures: string[];
  scopeRestricted: boolean;
  /** Set to the server's cap when the read was capped, else undefined. */
  truncatedAt: number | undefined;
  foreignKeys: ForeignKey[];
  fromCache: boolean;
  cacheAge: string;
}

/**
 * Fingerprint-gated stale-while-revalidate load.
 *
 *   fresh (ttl > 0)            → disk, zero API calls
 *   stale, fingerprint matches → extend, zero vault decryptions
 *   stale, fingerprint differs → full fetch
 *   miss                       → full fetch
 */
async function loadVariables(options: ResolveOptions): Promise<LoadResult> {
  const { projectId, environment, organizationId } = options;

  if (!options.useCache) {
    // Survey FIRST: the one fingerprint call yields both the foreign-key
    // notice and the fingerprint to store, so --no-cache costs exactly the
    // same two round trips as an ordinary cache miss.
    const survey = await surveyQuietly(options);
    const fresh = await fetchFresh(options);
    const foreignKeys = survey?.otherEnvKeys ?? [];
    persist(options, fresh, survey?.fingerprint, foreignKeys);
    return { ...fresh, foreignKeys, fromCache: false, cacheAge: "" };
  }

  const probe = probeCache(
    projectId,
    environment,
    organizationId,
    options.ttlSeconds
  );

  // The one path with no server contact at all. The foreign-key notice comes
  // off the cache entry rather than a fresh call, which is what makes
  // --cache-ttl mean what it says.
  if (probe.hit && probe.fresh) {
    return fromCacheEntry(probe.entry);
  }

  try {
    const check = await createAPIClient().checkFingerprint(
      projectId,
      environment,
      organizationId
    );

    if (probe.hit && check.fingerprint === probe.entry.fingerprint) {
      extendCacheFreshness(projectId, environment, organizationId);
      return {
        ...fromCacheEntry(probe.entry),
        foreignKeys: check.otherEnvKeys,
      };
    }

    const fresh = await fetchFresh(
      options,
      probe.hit ? "Secrets updated, refreshing" : "Loading"
    );
    persist(options, fresh, check.fingerprint, check.otherEnvKeys);
    return {
      ...fresh,
      foreignKeys: check.otherEnvKeys,
      fromCache: false,
      cacheAge: "",
    };
  } catch (err) {
    // Fail OPEN only for genuine connectivity failures. A server-side DENIAL
    // (suspended, revoked, membership gone) must fail CLOSED: purge the cached
    // secrets and surface the error, or a removed user keeps being served
    // decrypted secrets from disk until the hard max-age expires.
    if (probe.hit && isConnectivityError(err)) {
      if (!options.quiet) {
        warning(
          `Using offline cache (age ${formatAge(probe.entry.fetchedAt)}) — could not reach the server to verify freshness.`
        );
      }
      return fromCacheEntry(probe.entry);
    }
    deleteCache(projectId, environment, organizationId);
    throw err;
  }
}

type FreshFetch = Omit<LoadResult, "foreignKeys" | "fromCache" | "cacheAge">;

async function fetchFresh(
  options: ResolveOptions,
  labelPrefix = "Loading"
): Promise<FreshFetch> {
  const { projectId, projectName, environment, organizationId } = options;
  const api = createAPIClient();
  const call = () => api.listVariables(projectId, environment, organizationId);

  const result = options.quiet
    ? await call()
    : await withSpinner(
        `${labelPrefix} ${chalk.bold(environment)} secrets for ${chalk.bold(projectName || projectId)}...`,
        call
      );

  return {
    variables: result.variables,
    decryptionFailures: result.decryptionFailures,
    scopeRestricted: result.meta?.scopeRestricted ?? false,
    truncatedAt: result.truncatedAt,
  };
}

/**
 * Which accessible keys exist only in other environments. Advisory, so any
 * failure degrades to "we don't know" rather than taking the command down.
 */
async function surveyQuietly(
  options: ResolveOptions
): Promise<FingerprintCheck | undefined> {
  try {
    return await createAPIClient().checkFingerprint(
      options.projectId,
      options.environment,
      options.organizationId
    );
  } catch {
    return undefined;
  }
}

/**
 * Cache the fetch. The server fingerprint is stored ONLY for a complete set:
 * when a key failed to decrypt it is absent from `variables`, and storing the
 * server's fingerprint would make the next check match and pin the incomplete
 * set until metadata changes. Omitting it stores a client-computed
 * fingerprint that cannot match, so every run retries until the vault heals.
 */
function persist(
  options: ResolveOptions,
  fetched: FreshFetch,
  serverFingerprint: string | undefined,
  foreignKeys: ForeignKey[]
): void {
  const complete =
    fetched.decryptionFailures.length === 0 &&
    fetched.truncatedAt === undefined;
  writeCache(
    options.projectId,
    options.environment,
    options.organizationId,
    fetched.variables,
    complete ? serverFingerprint : undefined,
    {
      decryptionFailures: fetched.decryptionFailures,
      scopeRestricted: fetched.scopeRestricted,
      truncatedAt: fetched.truncatedAt,
      foreignKeys,
    }
  );
}

function fromCacheEntry(entry: CacheEntry): LoadResult {
  return {
    variables: entry.variables,
    decryptionFailures: entry.decryptionFailures ?? [],
    scopeRestricted: entry.scopeRestricted ?? false,
    truncatedAt: entry.truncatedAt,
    foreignKeys: entry.foreignKeys ?? [],
    fromCache: true,
    cacheAge: formatAge(entry.fetchedAt),
  };
}
