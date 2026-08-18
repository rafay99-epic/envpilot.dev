import { Command } from "commander";
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
  describeProblem,
  isBlocking,
  type Problem,
} from "../lib/secrets/problems.js";
import { serialize, type FormatType } from "../lib/format-converter.js";

/**
 * Formats this command emits. `shell` is the one that does not exist in
 * format-converter, because it is not a file format: it is a stream of
 * `export K=V` lines meant to be eval'd, and it must shell-quote rather than
 * dotenv-quote.
 */
const FORMATS = ["shell", "env", "json", "yaml", "docker-compose"] as const;
type ExportFormat = (typeof FORMATS)[number];

interface ExportOptions {
  env?: string;
  project?: string;
  organization?: string;
  format: string;
  allowPartial?: boolean;
  cache?: boolean;
}

export const exportCommand = new Command("export")
  .description(
    "Print project secrets to stdout for eval or redirection. " +
      'Use `eval "$(envpilot export)"` to load them into your current shell, ' +
      "which survives any wrapper that filters the environment because your " +
      "shell is the process holding them."
  )
  .option("-e, --env <environment>", "Environment to load")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("-o, --organization <id>", "Organization id")
  .option("--format <format>", `Output format: ${FORMATS.join(", ")}`, "shell")
  .option(
    "--allow-partial",
    "Emit even when secrets are missing or undecryptable"
  )
  .option("--no-cache", "Skip cache and always fetch fresh secrets")
  .action(async (options: ExportOptions) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();

      const format = options.format as ExportFormat;
      if (!FORMATS.includes(format)) {
        throw invalidInput(
          `Unknown format "${options.format}". Valid formats: ${FORMATS.join(", ")}.`
        );
      }

      const config = readProjectConfigV2();
      if (!config) throw notInitialized();
      const project = options.project
        ? resolveProject(config, options.project)
        : getActiveProject(config);
      if (!project) throw notInitialized();

      const environment = resolveEnvironmentOrThrow(
        options.env,
        project.environment
      );

      const resolved = await resolveSecrets({
        projectId: project.projectId,
        projectName: project.projectName,
        environment,
        organizationId: options.organization || project.organizationId,
        useCache: options.cache !== false,
        ttlSeconds: 0,
        // Everything informational goes to stderr or nowhere: stdout is the
        // payload and is very often being eval'd.
        quiet: true,
      });

      const blocking = resolved.problems.filter(isBlocking);
      if (blocking.length > 0 && !options.allowPartial) {
        throw incompleteSecrets(blocking.map(describeProblem));
      }
      reportToStderr(resolved.problems);

      process.stdout.write(render(resolved.values, format, environment));
    } catch (err) {
      await handleError(err);
    }
  });

function resolveEnvironmentOrThrow(
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

/** Advisories go to stderr so `eval "$(envpilot export)"` stays clean. */
function reportToStderr(problems: readonly Problem[]): void {
  for (const problem of problems) {
    process.stderr.write(`envpilot: ${describeProblem(problem)}\n`);
  }
}

function render(
  values: Map<string, string>,
  format: ExportFormat,
  environment: string
): string {
  const record = Object.fromEntries(values);
  if (format === "shell") {
    return [...values.keys()]
      .sort()
      .map((key) => `export ${key}=${shellQuote(values.get(key) ?? "")}`)
      .join("\n")
      .concat("\n");
  }
  return serialize(record, format as FormatType, { environment });
}

/**
 * POSIX single-quote escaping: wrap in single quotes and replace each embedded
 * single quote with '"'"'. Safe for every byte including newlines, which is
 * why this does not try to be clever about when quoting is unnecessary.
 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
