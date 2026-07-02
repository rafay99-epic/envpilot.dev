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
} from "../lib/errors.js";
import type { Variable } from "../types/index.js";
import {
  probeCache,
  writeCache,
  extendCacheFreshness,
  formatAge,
} from "../lib/variables-cache.js";

// 1 hour: vault decryptions only happen on first run or when vars actually change.
// Stale checks use the cheap fingerprint endpoint (no vault calls).
const DEFAULT_TTL = 3600;

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
    "How long cached secrets stay fresh before a fingerprint check " +
      "(default: 3600s / 1h; 0 = always fingerprint-check)",
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

      if (options.cache === false) {
        // --no-cache: bypass cache, always hit the API
        variables = await doFetch(
          project,
          environment,
          organizationId,
          options.quiet
        );
        writeCache(project.projectId, environment, organizationId, variables);
      } else {
        const probe = probeCache(
          project.projectId,
          environment,
          organizationId,
          ttl
        );

        if (probe.hit && probe.fresh) {
          // ── FRESH: zero API calls ──────────────────────────────────────
          variables = probe.entry.variables;
          cacheHit = true;
          cacheAge = formatAge(probe.entry.fetchedAt);
        } else if (probe.hit && !probe.fresh) {
          // ── STALE: fingerprint check (no vault decryption) ─────────────
          // Ask the server if anything changed using only Convex metadata.
          // Only do the expensive vault fetch when vars actually changed.
          try {
            const api = createAPIClient();
            const serverFingerprint = await api.checkFingerprint(
              project.projectId,
              environment,
              organizationId
            );

            if (serverFingerprint === probe.entry.fingerprint) {
              // Nothing changed — reset TTL, serve from cache for free.
              extendCacheFreshness(
                project.projectId,
                environment,
                organizationId
              );
              variables = probe.entry.variables;
              cacheHit = true;
              cacheAge = formatAge(probe.entry.fetchedAt);
            } else {
              // Variables changed — full fetch required. Store the server's
              // fingerprint verbatim so the next stale check is guaranteed to
              // match (no divergent client-side recomputation).
              variables = await doFetch(
                project,
                environment,
                organizationId,
                options.quiet,
                "Secrets updated, refreshing"
              );
              writeCache(
                project.projectId,
                environment,
                organizationId,
                variables,
                serverFingerprint
              );
            }
          } catch {
            // Fingerprint check failed (e.g. offline) — fall back to stale
            // cache, but say so out loud. readCache already refuses to return
            // entries past the hard max-age, so we never serve indefinitely.
            variables = probe.entry.variables;
            cacheHit = true;
            cacheAge = formatAge(probe.entry.fetchedAt);
            if (!options.quiet) {
              warning(
                `Using offline cache (age ${cacheAge}) — could not reach the server to verify freshness.`
              );
            }
          }
        } else {
          // ── MISS: first run or cache cleared ──────────────────────────
          variables = await doFetch(
            project,
            environment,
            organizationId,
            options.quiet
          );
          writeCache(project.projectId, environment, organizationId, variables);
        }
      }

      if (variables.length === 0) {
        warning(
          `No variables found for ${environment}. Running command without injected secrets.`
        );
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
        info(
          `Injected ${chalk.bold(injectedCount)} ${injectedCount === 1 ? "variable" : "variables"} from ${chalk.bold(`${project.projectName || project.projectId}/${environment}`)}${cacheTag}`
        );
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

/**
 * Fetch variables from the API with an optional spinner and decryption-failure warnings.
 * Returns only the successfully decrypted variables; warns the user about any that failed.
 */
async function doFetch(
  project: { projectId: string; projectName: string },
  environment: string,
  organizationId: string,
  quiet: boolean | undefined,
  labelPrefix = "Loading"
): Promise<Variable[]> {
  const label = `${labelPrefix} ${chalk.bold(environment)} secrets for ${chalk.bold(project.projectName || project.projectId)}...`;
  const api = createAPIClient();

  const { variables, decryptionFailures } = quiet
    ? await api.listVariables(project.projectId, environment, organizationId)
    : await withSpinner(label, () =>
        api.listVariables(project.projectId, environment, organizationId)
      );

  // Warn about any vault decryption failures so the user knows which
  // variables were NOT injected — these are skipped, not silently broken.
  if (decryptionFailures.length > 0) {
    for (const key of decryptionFailures) {
      warning(
        `Could not decrypt ${chalk.bold(key)} — skipped (vault error, check server logs)`
      );
    }
  }

  return variables;
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
