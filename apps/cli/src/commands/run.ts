import { Command } from "commander";
import crossSpawn from "cross-spawn";
import { constants as osConstants } from "node:os";
import chalk from "chalk";
import { info, error, warning, success } from "../lib/ui.js";
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
  incompleteSecrets,
  handleError,
} from "../lib/errors.js";
import { resolveEnvironment, ENVIRONMENTS } from "../lib/validators.js";
import { resolveSecrets } from "../lib/secrets/resolve.js";
import {
  checkRequired,
  describeProblem,
  isBlocking,
  parseKeyList,
  type Problem,
} from "../lib/secrets/problems.js";
import { startHeal } from "../lib/secrets/heal.js";
import { mountSecrets } from "../lib/secrets/mount.js";
import type { SecretsPipe } from "../lib/secrets/pipe.js";
import type { ProjectConfigV2 } from "../types/index.js";

// 0 = fingerprint-check every run (one cheap metadata query, no vault calls)
// so a variable changed in the dashboard is picked up on the very next run.
// Vault decryption still only happens when variables actually changed.
const DEFAULT_TTL = 0;

interface RunOptions {
  env?: string;
  project?: string;
  organization?: string;
  keepExisting?: boolean;
  preserveEnv?: string;
  require?: string[];
  allowPartial?: boolean;
  /** Commander sets this to `false` when --no-heal is passed */
  heal?: boolean;
  mount?: string;
  mountMaxReads?: string;
  print?: boolean;
  quiet?: boolean;
  shell?: boolean;
  /** Commander sets this to `false` when --no-cache is passed */
  cache?: boolean;
  cacheTtl?: string;
}

export const runCommand = new Command("run")
  .description(
    "Run a command with project secrets injected. Secrets are delivered to " +
      "the child in memory (no .env file is written) and, on Node children, " +
      "re-delivered through a NODE_OPTIONS shim so wrappers that filter the " +
      "environment (Turborepo strict mode and friends) cannot silently drop " +
      "them. A decrypted copy is cached at ~/.config/envpilot/run-cache " +
      "(mode 0600); use --no-cache to skip it or `envpilot logout` to purge."
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
    "--preserve-env <keys>",
    "Comma-separated keys where an existing shell value wins over the secret"
  )
  .option(
    "--keep-existing",
    "Preserve every existing shell var (see --preserve-env)"
  )
  .option(
    "--require <keys>",
    "Comma-separated keys that must be present, or the command does not run",
    collect,
    [] as string[]
  )
  .option(
    "--allow-partial",
    "Run even when secrets are missing or failed to decrypt (not recommended)"
  )
  .option(
    "--no-heal",
    "Do not install the NODE_OPTIONS shim that survives env-filtering wrappers"
  )
  .option(
    "--mount <path>",
    "Also expose the secrets as an ephemeral dotenv at <path> (a named pipe, never written to disk)"
  )
  .option("--mount-max-reads <n>", "Stop serving --mount after n reads")
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
      "(default: 0 = verify freshness on every run)",
    String(DEFAULT_TTL)
  )
  .passThroughOptions()
  .allowExcessArguments()
  .action(async (commandArgs: string[], options: RunOptions) => {
    const teardown: Array<() => void> = [];
    try {
      if (!options.print && commandArgs.length === 0) {
        throw invalidInput(
          "No command provided. Usage: envpilot run -- <command> [args...]"
        );
      }
      if (!isAuthenticated()) throw notAuthenticated();

      const config = readProjectConfigV2();
      if (!config) throw notInitialized();

      const project = options.project
        ? resolveProject(config, options.project)
        : getActiveProject(config);
      if (!project) {
        if (options.project) throw unknownProject(config, options.project);
        throw notInitialized();
      }

      const environment = resolveRequestedEnvironment(
        options.env,
        project.environment
      );
      const organizationId = options.organization || project.organizationId;

      const resolved = await resolveSecrets({
        projectId: project.projectId,
        projectName: project.projectName,
        environment,
        organizationId,
        useCache: options.cache !== false,
        ttlSeconds: parseTtl(options.cacheTtl),
        quiet: options.quiet,
      });

      const finalEnv = composeEnv(resolved.values, options);

      // Required keys are checked against the COMPOSED environment, so a value
      // already exported in the caller's shell counts as satisfied.
      const problems = [...resolved.problems];
      const missing = checkRequired(finalEnv, parseKeyList(options.require));
      if (missing) problems.push(missing);

      const blocking = problems.filter(isBlocking);
      if (blocking.length > 0 && !options.allowPartial) {
        throw incompleteSecrets(blocking.map(describeProblem));
      }

      if (!options.quiet) {
        reportProblems(problems, options.allowPartial ?? false);
      }

      if (options.print) {
        printInjectionPreview(resolved.values, project, environment);
        return;
      }

      // Heal AFTER the gate: there is no point re-delivering a set we already
      // decided is unusable. Failing to start heal is never fatal; the child
      // still gets the inherited copy.
      if (options.heal !== false) {
        // Heal is an enhancement over plain inheritance, so a failure to set
        // it up must never take the run down. The child still gets the
        // inherited copy, and --require would only have re-delivered it.
        try {
          const healed = startHeal(resolved.values);
          if (healed) {
            teardown.push(healed.close);
            finalEnv.NODE_OPTIONS = finalEnv.NODE_OPTIONS
              ? `${finalEnv.NODE_OPTIONS} ${healed.nodeOptions}`
              : healed.nodeOptions;
          }
        } catch (err) {
          if (!options.quiet) {
            warning(
              `Could not install the rehydration shim: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      if (options.mount) {
        const pipe: SecretsPipe = mountSecrets(resolved.values, options.mount, {
          maxReads: parsePositiveInt(options.mountMaxReads),
        });
        teardown.push(pipe.close);
        if (!options.quiet) info(`Mounted secrets at ${chalk.bold(pipe.path)}`);
      }

      if (!options.quiet) {
        reportInjection(resolved, project, environment, options);
      }

      process.exitCode = await runChild(commandArgs, finalEnv, options);
    } catch (err) {
      await handleError(err);
    } finally {
      for (const close of teardown) {
        try {
          close();
        } catch {
          // Best effort — a leaked pipe in a temp dir beats a crash on exit.
        }
      }
    }
  });

// ── Option parsing ──────────────────────────────────────────────────────────

/** Commander collector so --require can be repeated as well as comma-joined. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function resolveRequestedEnvironment(
  requested: string | undefined,
  fallback: string
): string {
  if (requested === undefined) return fallback;
  const canonical = resolveEnvironment(requested);
  if (!canonical) {
    throw invalidInput(
      `Unknown environment "${requested}". Valid environments: ${ENVIRONMENTS.join(", ")}.`
    );
  }
  return canonical;
}

/**
 * Parse the TTL honestly: 0 is a valid value meaning "always fingerprint
 * check", so it must NOT fall back to the default. Only a non-finite or
 * negative parse does.
 */
function parseTtl(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? String(DEFAULT_TTL), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function unknownProject(config: ProjectConfigV2, requested: string): Error {
  const linked = config.projects
    .map((p) => `  ${p.projectName || p.projectId} (${p.environment})`)
    .join("\n");
  return invalidInput(
    `Project not found in this directory: ${requested}\n\nLinked projects:\n${linked}`
  );
}

// ── Environment composition ─────────────────────────────────────────────────

/**
 * Secrets win over the parent shell by default. `--preserve-env=A,B` pins
 * individual keys to their shell value, which is what you want for a local
 * DEBUG or PORT override without surrendering precedence wholesale.
 * `--keep-existing` is the old all-or-nothing form of the same idea.
 */
function composeEnv(
  values: Map<string, string>,
  options: RunOptions
): NodeJS.ProcessEnv {
  const preserved = new Set(
    parseKeyList(options.preserveEnv ? [options.preserveEnv] : undefined)
  );
  const composed: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of values) {
    if (options.keepExisting && process.env[key] !== undefined) continue;
    if (preserved.has(key) && process.env[key] !== undefined) continue;
    composed[key] = value;
  }
  return composed;
}

// ── Reporting ───────────────────────────────────────────────────────────────

function reportProblems(
  problems: readonly Problem[],
  allowedPartial: boolean
): void {
  for (const problem of problems) {
    const line = describeProblem(problem);
    if (isBlocking(problem)) {
      warning(
        `${line}${allowedPartial ? " (continuing: --allow-partial)" : ""}`
      );
    } else {
      warning(line);
    }
    if (problem.kind === "other-environments") {
      info("Use -e <environment> to load a different environment.");
    }
  }
}

function reportInjection(
  resolved: {
    values: Map<string, string>;
    fromCache: boolean;
    cacheAge: string;
  },
  project: { projectId: string; projectName: string },
  environment: string,
  options: RunOptions
): void {
  const count = resolved.values.size;
  const cacheTag = resolved.fromCache
    ? chalk.dim(` cache (${resolved.cacheAge})`)
    : "";
  const healTag =
    options.heal === false ? chalk.dim(" heal off") : chalk.dim(" heal on");
  info(
    `Injected ${chalk.bold(count)} ${count === 1 ? "variable" : "variables"} from ${chalk.bold(
      `${project.projectName || project.projectId}/${environment}`
    )}${cacheTag}${healTag}`
  );

  const overridden = [...resolved.values.keys()].filter(
    (key) =>
      process.env[key] !== undefined &&
      process.env[key] !== resolved.values.get(key)
  );
  if (overridden.length > 0 && !options.keepExisting) {
    warning(
      `Overriding ${overridden.length} shell var${overridden.length === 1 ? "" : "s"}: ${overridden.slice(0, 3).join(", ")}${overridden.length > 3 ? `, +${overridden.length - 3} more` : ""}`
    );
    info("Use --preserve-env <keys> to keep your shell values instead.");
  }
  console.log();
}

function printInjectionPreview(
  values: Map<string, string>,
  project: { projectId: string; projectName: string },
  environment: string
): void {
  const keys = [...values.keys()].sort();
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
      console.log(
        `  ${chalk.cyan(key)}=${chalk.dim(maskForPreview(values.get(key) ?? ""))}`
      );
    }
  }
  console.log();
  success("Dry run — no command executed.");
}

/**
 * Mask a secret for the --print preview. Reveals at most the 2 leading
 * characters (never any trailing ones), and fully masks anything shorter than
 * ~12 chars so short secrets are not partially leaked.
 */
function maskForPreview(value: string): string {
  const dots = "•".repeat(6);
  if (value.length < 12) return `${dots} (${value.length} chars)`;
  return `${value.slice(0, 2)}${dots} (${value.length} chars)`;
}

// ── Child process ───────────────────────────────────────────────────────────

/**
 * Spawn the child with the composed environment and resolve with the exit code
 * the parent should adopt. Never calls process.exit itself, so Node can flush
 * stdio and run the caller's teardown.
 *
 * Resolution follows shell conventions: normal exit is the child's code,
 * killed by N is 128+N, ENOENT is 127, EACCES is 126, any other spawn error 1.
 */
function runChild(
  commandArgs: string[],
  env: NodeJS.ProcessEnv,
  options: RunOptions
): Promise<number> {
  return new Promise((resolve) => {
    // With shell:false, cross-spawn resolves Windows .cmd/.exe and escapes
    // args correctly, and no shell means no injection surface. --shell is the
    // explicit opt-in to shell semantics.
    const [command, ...args] = options.shell
      ? [process.env.SHELL || "/bin/sh", "-c", commandArgs.join(" ")]
      : commandArgs;

    if (!command) {
      resolve(1);
      return;
    }

    const child = crossSpawn(command, args, {
      stdio: "inherit",
      env,
      shell: false,
    });

    // Forward only SIGTERM/SIGHUP. SIGINT (Ctrl-C) and SIGQUIT are delivered
    // by the terminal to the whole foreground process group, so the child
    // already receives them; re-forwarding would double-signal it.
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGHUP"];
    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const sig of signals) {
      const handler = () => {
        if (!child.killed) {
          try {
            child.kill(sig);
          } catch {
            // Child may already be exiting.
          }
        }
      };
      handlers.set(sig, handler);
      process.on(sig, handler);
    }
    const cleanup = () => {
      for (const [sig, handler] of handlers) process.off(sig, handler);
    };

    child.on("error", (err) => {
      cleanup();
      const code = (err as NodeJS.ErrnoException).code;
      const shown = options.shell ? commandArgs.join(" ") : command;
      if (code === "ENOENT") {
        error(
          `Command not found: ${shown}. Make sure it is installed and on your PATH.`
        );
        resolve(127);
      } else if (code === "EACCES") {
        error(`Permission denied executing: ${shown}`);
        resolve(126);
      } else {
        error(`Failed to spawn process: ${err.message}`);
        resolve(1);
      }
    });

    child.on("exit", (code, signal) => {
      cleanup();
      resolve(signal ? 128 + (osConstants.signals[signal] ?? 0) : (code ?? 0));
    });
  });
}
