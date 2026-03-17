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

  fetch(`${apiUrl}/api/version`, { signal: AbortSignal.timeout(5000) })
    .then((res) => {
      if (!res.ok) return;
      return res.json() as Promise<{ cli?: string }>;
    })
    .then((data) => {
      if (!data?.cli) return;

      cache.set("lastVersionCheck", Date.now());

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
    });
}
