import chalk from "chalk";
import Conf from "conf";
import { getApiUrl } from "./config.js";

declare const __CLI_VERSION__: string;
const CLI_VERSION =
  typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

// Lazy-init so --help / --version don't pay disk I/O cost
let _cache: Conf<{ lastVersionCheck?: number }> | null = null;
function getCache() {
  if (!_cache) {
    _cache = new Conf<{ lastVersionCheck?: number }>({
      projectName: "envpilot",
      configName: "version-cache",
    });
  }
  return _cache;
}

/**
 * Non-blocking version check — prints a notice if a newer CLI version is available.
 * Throttled to at most once per hour. Errors are silently ignored.
 */
export function checkForUpdate(): void {
  const cache = getCache();
  const lastCheck = cache.get("lastVersionCheck");
  if (lastCheck && Date.now() - lastCheck < CHECK_INTERVAL) return;

  const apiUrl = getApiUrl();

  // Record the check timestamp UP FRONT (before any network I/O). Otherwise an
  // offline machine — where the fetch rejects and we never reach the old
  // in-`.then` cache.set — would re-attempt (and re-hang) on every single
  // command. Writing first means we only try once per CHECK_INTERVAL even when
  // the network is down.
  cache.set("lastVersionCheck", Date.now());

  // Use a manually-unref'd timeout instead of AbortSignal.timeout(): the latter
  // keeps a referenced timer on the event loop for the full 5s, which makes a
  // fast, already-finished command hang until the timer fires. unref() lets the
  // process exit as soon as the real work is done.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  timer.unref?.();

  fetch(`${apiUrl}/api/version`, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) return;
      return res.json() as Promise<{ cli?: string }>;
    })
    .then((data) => {
      if (!data?.cli) return;

      if (data.cli !== CLI_VERSION) {
        console.log();
        console.log(
          chalk.yellow("  Update available:"),
          chalk.dim(CLI_VERSION),
          chalk.yellow("→"),
          chalk.green(data.cli)
        );
        console.log(
          chalk.dim("  Run"),
          chalk.cyan("npm update -g @envpilot/cli"),
          chalk.dim("to update")
        );
        console.log();
      }
    })
    .catch(() => {
      // Silent — no network shouldn't break the CLI
    })
    .finally(() => {
      clearTimeout(timer);
    });
}
