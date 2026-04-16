import { Command } from "commander";
import { spawn } from "node:child_process";
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
    "Run a command with project secrets injected as environment variables (no .env file written)"
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
    "Run the command through the user's shell (enables pipes, &&, $VAR expansion)"
  )
  .option("-q, --quiet", "Suppress informational messages")
  .option("--no-cache", "Skip cache and always fetch fresh secrets from server")
  .option(
    "--cache-ttl <seconds>",
    "How long cached secrets stay fresh before a fingerprint check (default: 3600s / 1h)",
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
      const ttl = Math.max(
        1,
        parseInt(options.cacheTtl ?? String(DEFAULT_TTL), 10) || DEFAULT_TTL
      );

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
              // Variables changed — full fetch required.
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
                variables
              );
            }
          } catch {
            // Fingerprint check failed (e.g. offline) — serve stale cache.
            // The next run will retry the fingerprint check.
            variables = probe.entry.variables;
            cacheHit = true;
            cacheAge = formatAge(probe.entry.fetchedAt);
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

      // Spawn child process
      await runChild(commandArgs, finalEnv, options);
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

function maskForPreview(value: string): string {
  if (value.length <= 6) return "******";
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

function runChild(
  commandArgs: string[],
  env: NodeJS.ProcessEnv,
  options: RunOptions
): Promise<void> {
  return new Promise((resolve) => {
    const [command, ...args] = commandArgs;
    if (!command) {
      // Should be guarded earlier, but be defensive.
      process.exit(1);
    }

    // On Windows, .cmd / .bat / .ps1 require shell to resolve.
    // Auto-enable shell on Windows for ergonomic parity with Unix.
    const isWindows = process.platform === "win32";
    const useShell = options.shell === true || isWindows;

    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: useShell,
    });

    // Forward common signals to the child so Ctrl-C, SIGTERM, etc. propagate.
    const signals: NodeJS.Signals[] = [
      "SIGINT",
      "SIGTERM",
      "SIGHUP",
      "SIGQUIT",
    ];

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
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        error(
          `Command not found: ${command}. Make sure it is installed and on your PATH.`
        );
      } else if (code === "EACCES") {
        error(`Permission denied executing: ${command}`);
      } else {
        error(`Failed to spawn process: ${err.message}`);
      }
      process.exit(1);
    });

    child.on("exit", (code, signal) => {
      cleanup();
      if (signal) {
        // Re-raise the signal so parent shells observe the same exit cause.
        // Fall back to exit(1) if re-raising is not possible.
        try {
          process.kill(process.pid, signal);
        } catch {
          process.exit(1);
        }
      } else {
        process.exit(code ?? 0);
      }
      resolve();
    });
  });
}
