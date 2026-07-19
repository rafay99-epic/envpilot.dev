import { Command } from "commander";
import crossSpawn from "cross-spawn";
import { constants as osConstants } from "node:os";
import chalk from "chalk";
import { info, error, warning, withSpinner, success } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import {
  readProjectConfigV2,
  resolveProject,
  getActiveProject,
} from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  invalidInput,
  handleError,
  isConnectivityError,
} from "../lib/errors.js";
import type { Variable } from "../types/index.js";
import {
  probeCache,
  writeCache,
  extendCacheFreshness,
  deleteCache,
  formatAge,
} from "../lib/variables-cache.js";
import { validateEnvironment } from "../lib/validators.js";
import type { FingerprintCheck } from "../lib/api.js";

// 0 = fingerprint-check every run (one cheap metadata query, ~50-100ms, no
// vault calls) so a variable changed in the dashboard is picked up on the
// very next run. Vault decryption still only happens when vars actually
// changed. Pass --cache-ttl <s> to skip even the fingerprint check for s
// seconds (the old behavior; anything cached is then blind to changes).
const DEFAULT_TTL = 0;

interface RunOptions {
  env?: string;
  project?: string;
  organization?: string;
  keepExisting?: boolean;
  print?: boolean;
  quiet?: boolean;
  shell?: boolean;
  /** Commander sets this to `false` when --no-cache is passed */
  cache?: boolean;
  cacheTtl?: string;
}

export const runCommand = new Command("run")
  .description(
    "Run a command with project secrets injected as environment variables. " +
      "Secrets are injected into the child process in-memory (no .env file is " +
      "written), but a decrypted copy is cached locally at " +
      "~/.config/envpilot/run-cache (mode 0600, same protection as a .env) to " +
      "avoid re-fetching on every run. Use --no-cache to skip the cache, or " +
      "`envpilot logout` to purge it."
  )
  .argument("[command...]", "Command and arguments to execute")
  .option(
    "-e, --env <environment>",
    "Environment to load (development, staging, production)"
  )
  .option(
    "-p, --project <name-or-id>",
    "Linked project to load secrets from (defaults to active)"
  )
  .option(
    "-o, --organization <id>",
    "Organization id (overrides linked project's org)"
  )
  .option(
    "--keep-existing",
    "Don't overwrite env vars that are already set in the parent shell"
  )
  .option(
    "--print",
    "Print the variables that would be injected and exit (no command runs)"
  )
  .option(
    "--shell",
    'Run the command string through your shell ($SHELL or /bin/sh -c "..."), ' +
      "enabling pipes, &&, and $VAR expansion. Without this flag the command is " +
      "executed directly with no shell, so arguments are passed through verbatim " +
      "(safe from shell injection)."
  )
  .option("-q, --quiet", "Suppress informational messages")
  .option("--no-cache", "Skip cache and always fetch fresh secrets from server")
  .option(
    "--cache-ttl <seconds>",
    "How long cached secrets are served without even a fingerprint check " +
      "(default: 0 = verify freshness on every run; the check is one cheap " +
      "metadata query, secrets are only re-decrypted when they changed)",
    String(DEFAULT_TTL)
  )
  .passThroughOptions()
  .allowExcessArguments()
  .action(async (commandArgs: string[], options: RunOptions) => {
    try {
      // Validate we have a command (unless --print)
      if (!options.print && (!commandArgs || commandArgs.length === 0)) {
        throw invalidInput(
          "No command provided. Usage: envpilot run -- <command> [args...]"
        );
      }

      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // Resolve linked project + environment
      const config = readProjectConfigV2();
      if (!config) throw notInitialized();

      const project = options.project
        ? resolveProject(config, options.project)
        : getActiveProject(config);

      if (!project) {
        if (options.project) {
          error(`Project not found in this directory: ${options.project}`);
          console.log();
          console.log("Linked projects:");
          for (const p of config.projects) {
            console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
          }
          process.exit(1);
        }
        throw notInitialized();
      }

      const environment = options.env || project.environment;
      if (options.env && !validateEnvironment(options.env)) {
        throw invalidInput(
          `Unknown environment "${options.env}". Valid environments: development, staging, production.`
        );
      }
      const organizationId = options.organization || project.organizationId;
      // Parse the TTL honestly: 0 is a valid value meaning "always
      // fingerprint-check", so we must NOT fall back to the default on 0.
      // Only a non-finite / negative parse falls back to DEFAULT_TTL.
      const parsedTtl = Number.parseInt(
        options.cacheTtl ?? String(DEFAULT_TTL),
        10
      );
      const ttl =
        Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : DEFAULT_TTL;

      // ── Fingerprint-gated stale-while-revalidate cache ───────────────────
      let variables: Variable[];
      let cacheHit = false;
      let cacheAge = "";
      // Warnings to emit once, whether the run is served from cache or a
      // fresh fetch: keys that live only in OTHER environments, keys that
      // failed to decrypt, and whether the caller's role scoped the set.
      let otherEnvKeys: FingerprintCheck["otherEnvKeys"] = [];
      let decryptionFailures: string[] = [];
      let scopeRestricted = false;

      if (options.cache === false) {
        // --no-cache: bypass cache, always hit the API
        const fetched = await doFetch(
          project,
          environment,
          organizationId,
          options.quiet
        );
        variables = fetched.variables;
        decryptionFailures = fetched.decryptionFailures;
        scopeRestricted = fetched.scopeRestricted;
        otherEnvKeys = await fetchOtherEnvKeys(
          project.projectId,
          environment,
          organizationId
        );
        writeCache(
          project.projectId,
          environment,
          organizationId,
          variables,
          undefined,
          {
            decryptionFailures,
            scopeRestricted,
          }
        );
      } else {
        const probe = probeCache(
          project.projectId,
          environment,
          organizationId,
          ttl
        );

        if (probe.hit && probe.fresh) {
          // ── FRESH: zero API calls (only when --cache-ttl > 0) ──────────
          variables = probe.entry.variables;
          cacheHit = true;
          cacheAge = formatAge(probe.entry.fetchedAt);
          decryptionFailures = probe.entry.decryptionFailures ?? [];
          scopeRestricted = probe.entry.scopeRestricted ?? false;
        } else {
          // ── MISS or STALE: one metadata fingerprint check ──────────────
          // The check is cheap (no vault decryption) and also tells us which
          // accessible keys live only in other environments, so we can warn.
          try {
            const api = createAPIClient();
            const check = await api.checkFingerprint(
              project.projectId,
              environment,
              organizationId
            );
            otherEnvKeys = check.otherEnvKeys;

            if (probe.hit && check.fingerprint === probe.entry.fingerprint) {
              // Nothing changed — reset TTL, serve from cache for free.
              extendCacheFreshness(
                project.projectId,
                environment,
                organizationId
              );
              variables = probe.entry.variables;
              cacheHit = true;
              cacheAge = formatAge(probe.entry.fetchedAt);
              decryptionFailures = probe.entry.decryptionFailures ?? [];
              scopeRestricted = probe.entry.scopeRestricted ?? false;
            } else {
              // First run, cache cleared, or vars changed — full fetch. Store
              // the server's fingerprint verbatim so the next check matches.
              const fetched = await doFetch(
                project,
                environment,
                organizationId,
                options.quiet,
                probe.hit ? "Secrets updated, refreshing" : "Loading"
              );
              variables = fetched.variables;
              decryptionFailures = fetched.decryptionFailures;
              scopeRestricted = fetched.scopeRestricted;
              writeCache(
                project.projectId,
                environment,
                organizationId,
                variables,
                check.fingerprint,
                { decryptionFailures, scopeRestricted }
              );
            }
          } catch (err) {
            // Fail OPEN only for genuine connectivity failures. A server-side
            // DENIAL (access suspended/revoked, membership gone, permission
            // lost) must fail CLOSED: purge the cached secrets and surface the
            // error — otherwise a suspended/removed user keeps being served
            // decrypted secrets from disk for up to the hard max-age.
            if (probe.hit && isConnectivityError(err)) {
              // Offline — fall back to stale cache, but say so out loud.
              // readCache already refuses entries past the hard max-age.
              variables = probe.entry.variables;
              cacheHit = true;
              cacheAge = formatAge(probe.entry.fetchedAt);
              decryptionFailures = probe.entry.decryptionFailures ?? [];
              scopeRestricted = probe.entry.scopeRestricted ?? false;
              if (!options.quiet) {
                warning(
                  `Using offline cache (age ${cacheAge}) — could not reach the server to verify freshness.`
                );
              }
            } else {
              deleteCache(project.projectId, environment, organizationId);
              throw err;
            }
          }
        }
      }

      if (variables.length === 0) {
        warning(
          `No variables found for ${environment}. Running command without injected secrets.`
        );
      }

      // Repeat decryption-failure warnings even on cache-served runs — the
      // affected keys are NOT injected, and a user needs to know every time.
      if (!options.quiet && decryptionFailures.length > 0) {
        for (const key of decryptionFailures) {
          warning(
            `Could not decrypt ${chalk.bold(key)} — skipped (vault error, check server logs)`
          );
        }
      }

      // Build the env to inject
      const secrets: Record<string, string> = {};
      for (const v of variables) {
        secrets[v.key] = v.value;
      }

      // --print mode: show what would be injected and exit
      if (options.print) {
        printInjectionPreview(secrets, project, environment);
        return;
      }

      // Compose env: by default secrets win over parent shell env.
      // With --keep-existing, parent shell env wins (useful for local overrides).
      const baseEnv: NodeJS.ProcessEnv = { ...process.env };
      const finalEnv: NodeJS.ProcessEnv = options.keepExisting
        ? { ...secrets, ...baseEnv }
        : { ...baseEnv, ...secrets };

      // Detect overrides for an informational notice
      const overridden: string[] = [];
      if (!options.keepExisting) {
        for (const key of Object.keys(secrets)) {
          if (
            process.env[key] !== undefined &&
            process.env[key] !== secrets[key]
          ) {
            overridden.push(key);
          }
        }
      }

      if (!options.quiet) {
        const injectedCount = Object.keys(secrets).length;
        const cacheTag = cacheHit ? chalk.dim(` ⚡ cache (${cacheAge})`) : "";
        // "of M" only when the fingerprint check told us the total — the
        // fresh-cache path (--cache-ttl > 0) skips that check, so we can't
        // honestly claim a denominator there.
        const total = injectedCount + otherEnvKeys.length;
        const ofTotal =
          otherEnvKeys.length > 0 ? chalk.dim(` of ${total}`) : "";
        info(
          `Injected ${chalk.bold(injectedCount)}${ofTotal} ${injectedCount === 1 ? "variable" : "variables"} from ${chalk.bold(`${project.projectName || project.projectId}/${environment}`)}${cacheTag}`
        );
        if (otherEnvKeys.length > 0) {
          const names = otherEnvKeys.slice(0, 5).map((v) => v.key);
          const more =
            otherEnvKeys.length > 5 ? `, +${otherEnvKeys.length - 5} more` : "";
          warning(
            `${otherEnvKeys.length} variable${otherEnvKeys.length === 1 ? "" : "s"} not in ${chalk.bold(environment)}, not injected: ${names.join(", ")}${more}`
          );
          info(`Use -e <environment> to load a different environment.`);
        }
        if (scopeRestricted) {
          warning(
            `Your role restricts which variables you can see — some may be withheld for ${chalk.bold(environment)}.`
          );
        }
        if (overridden.length > 0) {
          warning(
            `Overriding ${overridden.length} shell var${overridden.length === 1 ? "" : "s"}: ${overridden.slice(0, 3).join(", ")}${overridden.length > 3 ? `, +${overridden.length - 3} more` : ""}`
          );
          info("Use --keep-existing to keep your shell values instead.");
        }
        console.log();
      }

      // Spawn child process. runChild resolves with the exit code (never calls
      // process.exit itself), so we set process.exitCode and let Node drain
      // streams and exit cleanly.
      process.exitCode = await runChild(commandArgs, finalEnv, options);
    } catch (err) {
      await handleError(err);
    }
  });

interface FetchResult {
  variables: Variable[];
  decryptionFailures: string[];
  scopeRestricted: boolean;
}

/**
 * Fetch variables from the API (vault decryption path). Returns the
 * successfully decrypted variables plus the metadata `run` repeats as
 * warnings (decryption failures, role scope). The caller emits the warnings
 * once, so they fire identically whether the run is fresh or cache-served.
 */
async function doFetch(
  project: { projectId: string; projectName: string },
  environment: string,
  organizationId: string,
  quiet: boolean | undefined,
  labelPrefix = "Loading"
): Promise<FetchResult> {
  const label = `${labelPrefix} ${chalk.bold(environment)} secrets for ${chalk.bold(project.projectName || project.projectId)}...`;
  const api = createAPIClient();

  const { variables, meta, decryptionFailures } = quiet
    ? await api.listVariables(project.projectId, environment, organizationId)
    : await withSpinner(label, () =>
        api.listVariables(project.projectId, environment, organizationId)
      );

  return {
    variables,
    decryptionFailures,
    scopeRestricted: meta?.scopeRestricted ?? false,
  };
}

/**
 * Which accessible keys exist ONLY in other environments — used to tell the
 * user "4 variables not in development" instead of silently dropping them.
 * Best-effort: on any error we simply report none (the notice is advisory).
 */
async function fetchOtherEnvKeys(
  projectId: string,
  environment: string,
  organizationId: string
): Promise<FingerprintCheck["otherEnvKeys"]> {
  try {
    const api = createAPIClient();
    const check = await api.checkFingerprint(
      projectId,
      environment,
      organizationId
    );
    return check.otherEnvKeys;
  } catch {
    return [];
  }
}

function printInjectionPreview(
  secrets: Record<string, string>,
  project: { projectId: string; projectName: string },
  environment: string
): void {
  const keys = Object.keys(secrets).sort();
  console.log();
  console.log(
    chalk.bold(
      `Would inject ${keys.length} ${keys.length === 1 ? "variable" : "variables"} from ${chalk.cyan(`${project.projectName || project.projectId}/${environment}`)}:`
    )
  );
  console.log();
  if (keys.length === 0) {
    console.log(chalk.dim("  (no variables)"));
  } else {
    for (const key of keys) {
      const value = secrets[key];
      const masked = maskForPreview(value);
      console.log(`  ${chalk.cyan(key)}=${chalk.dim(masked)}`);
    }
  }
  console.log();
  success("Dry run — no command executed.");
}

/**
 * Mask a secret for the --print preview. Reveals at most the 2 leading
 * characters (never any trailing characters), and fully masks anything shorter
 * than ~12 chars so short secrets (PINs, short tokens) aren't partially leaked.
 */
function maskForPreview(value: string): string {
  const len = value.length;
  const dots = "•".repeat(6);
  if (len < 12) return `${dots} (${len} chars)`;
  return `${value.slice(0, 2)}${dots} (${len} chars)`;
}

/**
 * Spawn the child command with secrets injected, and resolve with the exit
 * code the parent process should adopt. Never calls process.exit itself — the
 * caller sets process.exitCode so Node can flush stdio and exit cleanly.
 *
 * Resolution codes follow shell conventions:
 *   - normal exit  → the child's own exit code
 *   - killed by N  → 128 + N (matches how a shell reports signal deaths)
 *   - ENOENT       → 127 (command not found)
 *   - EACCES       → 126 (found but not executable)
 *   - other spawn  → 1
 */
function runChild(
  commandArgs: string[],
  env: NodeJS.ProcessEnv,
  options: RunOptions
): Promise<number> {
  return new Promise((resolve) => {
    // Resolve the command + args. In the default (no --shell) path we pass argv
    // straight through with shell:false — cross-spawn resolves Windows
    // .cmd/.exe and escapes args correctly, and no shell means no injection
    // surface. With --shell the user explicitly opts into shell semantics.
    let command: string;
    let args: string[];
    if (options.shell) {
      command = process.env.SHELL || "/bin/sh";
      args = ["-c", commandArgs.join(" ")];
    } else {
      [command, ...args] = commandArgs;
    }

    if (!command) {
      // Guarded earlier, but stay defensive rather than spawning "".
      resolve(1);
      return;
    }

    const child = crossSpawn(command, args, {
      stdio: "inherit",
      env,
      shell: false,
    });

    // Forward only SIGTERM/SIGHUP. SIGINT (Ctrl-C) and SIGQUIT are already
    // delivered by the terminal to the entire foreground process group, so the
    // child receives them directly — re-forwarding here would double-signal it.
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGHUP"];

    const forward: Partial<Record<NodeJS.Signals, () => void>> = {};
    for (const sig of signals) {
      const handler = () => {
        if (!child.killed) {
          try {
            child.kill(sig);
          } catch {
            // ignore — child may already be exiting
          }
        }
      };
      forward[sig] = handler;
      process.on(sig, handler);
    }

    const cleanup = () => {
      for (const sig of signals) {
        const handler = forward[sig];
        if (handler) process.off(sig, handler);
      }
    };

    child.on("error", (err) => {
      cleanup();
      // With shell:false, ENOENT surfaces reliably on the error event across
      // all platforms (including Windows), so these friendly messages actually
      // fire everywhere.
      const code = (err as NodeJS.ErrnoException).code;
      const displayCommand = options.shell ? commandArgs.join(" ") : command;
      if (code === "ENOENT") {
        error(
          `Command not found: ${displayCommand}. Make sure it is installed and on your PATH.`
        );
        resolve(127);
      } else if (code === "EACCES") {
        error(`Permission denied executing: ${displayCommand}`);
        resolve(126);
      } else {
        error(`Failed to spawn process: ${err.message}`);
        resolve(1);
      }
    });

    child.on("exit", (code, signal) => {
      cleanup();
      if (signal) {
        // Report signal deaths the way a shell does: 128 + signal number.
        const signum = osConstants.signals[signal] ?? 0;
        resolve(128 + signum);
      } else {
        resolve(code ?? 0);
      }
    });
  });
}
