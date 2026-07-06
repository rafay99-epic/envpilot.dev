import chalk from "chalk";
import Conf from "conf";
import { CLI_VERSION } from "./cli-version.js";
import { getApiUrl } from "./config.js";

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

interface VersionCacheShape {
  lastVersionCheck?: number;
  /** Latest published CLI version (for the soft "update available" notice). */
  latest?: string;
  /** Minimum supported CLI version (below → hard block). */
  min?: string;
}

// Lazy-init so --help / --version don't pay disk I/O cost
let _cache: Conf<VersionCacheShape> | null = null;
function getCache(): Conf<VersionCacheShape> {
  if (!_cache) {
    _cache = new Conf<VersionCacheShape>({
      projectName: "envpilot",
      configName: "version-cache",
    });
  }
  return _cache;
}

/**
 * Compare two dotted numeric versions (`x.y.z`). Returns <0 if a<b, 0 if
 * equal, >0 if a>b. Non-numeric / missing segments are treated as 0, and any
 * pre-release suffix (`-beta.1`) is ignored — release ordering only.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export interface VersionVerdict {
  /** True when `current` is below the minimum supported version. */
  blocked: boolean;
  /** The newer version to advertise, or null when up to date / unknown. */
  updateAvailable: string | null;
}

/**
 * Pure decision function (no I/O) — the single source of truth for how a
 * running version relates to the server's latest/minimum. Unit-tested directly.
 */
export function evaluateVersion(
  current: string,
  latest: string | undefined,
  min: string | undefined
): VersionVerdict {
  const blocked = !!min && compareVersions(current, min) < 0;
  const updateAvailable =
    !!latest && compareVersions(current, latest) < 0 ? latest : null;
  return { blocked, updateAvailable };
}

interface VersionInfo {
  cli?: string;
  minCli?: string;
}

/**
 * Fetch the release manifest. Resolves to null on any failure (offline,
 * timeout, non-2xx, bad JSON) so callers can fail OPEN — a version check must
 * never brick the CLI over a flaky network.
 */
async function fetchVersionInfo(): Promise<VersionInfo | null> {
  // Manually-unref'd timeout instead of AbortSignal.timeout(): the latter keeps
  // a referenced timer on the event loop, making a fast command hang until it
  // fires. unref() lets the process exit as soon as the real work is done.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  timer.unref?.();
  try {
    const res = await fetch(`${getApiUrl()}/api/version`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as VersionInfo;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function printHardBlock(min: string, latest: string | undefined): void {
  const target = latest && compareVersions(latest, min) >= 0 ? latest : min;
  console.error();
  console.error(chalk.red("  ✖ This CLI version is no longer supported."));
  console.error(
    chalk.dim(`    You have ${CLI_VERSION}; ${min} or newer is required.`)
  );
  console.error(
    chalk.dim("    Update with"),
    chalk.cyan("npm install -g @envpilot/cli@latest"),
    chalk.dim(`(→ ${target})`)
  );
  console.error();
}

function printUpdateAvailable(latest: string): void {
  console.log();
  console.log(
    chalk.yellow("  Update available:"),
    chalk.dim(CLI_VERSION),
    chalk.yellow("→"),
    chalk.green(latest)
  );
  console.log(
    chalk.dim("  Run"),
    chalk.cyan("npm install -g @envpilot/cli@latest"),
    chalk.dim("to update")
  );
  console.log();
}

/** Fetch the manifest and persist latest/min. Never throws (fetch fails soft). */
async function refreshCache(cache: Conf<VersionCacheShape>): Promise<void> {
  try {
    const info = await fetchVersionInfo();
    if (!info) return;
    if (info.cli) cache.set("latest", info.cli);
    if (info.minCli) cache.set("min", info.minCli);
  } catch {
    // A cache write failure (disk full/read-only) must never surface — this
    // runs fire-and-forget on the background path where a rejection would be
    // unhandled.
  }
}

/**
 * Enforce the version policy before a command runs. Returns true when the
 * command must be BLOCKED (caller should exit non-zero); prints a soft update
 * notice and returns false when merely outdated or up to date.
 *
 * PERFORMANCE — the hot path adds ZERO network latency:
 *  - Fresh cache (checked within {@link CHECK_INTERVAL}): pure disk read, no
 *    network. This is the case for essentially every command.
 *  - Stale but we already have data: decide instantly from cache and refresh in
 *    the BACKGROUND (fire-and-forget, unref'd) — the command never waits.
 *  - No data at all (first-ever run, or cleared cache): the ONLY time we await
 *    a fetch, bounded to 3s and fail-open (offline → not blocked).
 *
 * The throttle timestamp is written up front, so even a failing/slow server is
 * hit at most once per interval — it can never repeatedly stall the CLI.
 */
export async function enforceVersion(): Promise<boolean> {
  try {
    const cache = getCache();
    const now = Date.now();
    const lastCheck = cache.get("lastVersionCheck") ?? 0;
    const hasData = cache.get("min") != null || cache.get("latest") != null;
    const stale = now - lastCheck >= CHECK_INTERVAL;

    if (stale) {
      // Throttle up front: one attempt per interval regardless of the outcome,
      // so a down server never turns every command into a 3s hang.
      cache.set("lastVersionCheck", now);
      if (hasData) {
        // We can already decide — refresh for NEXT time without blocking now.
        void refreshCache(cache);
      } else {
        // Nothing to decide with yet; must wait for the first fetch (≤3s).
        await refreshCache(cache);
      }
    }

    const latest = cache.get("latest");
    const min = cache.get("min");
    const { blocked, updateAvailable } = evaluateVersion(
      CLI_VERSION,
      latest,
      min
    );

    if (blocked) {
      printHardBlock(min as string, latest);
      return true;
    }
    if (updateAvailable) {
      printUpdateAvailable(updateAvailable);
    }
    return false;
  } catch {
    // FAIL OPEN. A version-check failure (corrupt cache file, disk/permission
    // error, unexpected Conf throw) must NEVER block a command — the check is a
    // guardrail, not a gate on the CLI working at all.
    return false;
  }
}
