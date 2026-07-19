import { Command } from "commander";
import { error, success, info, warning, withSpinner } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  invalidInput,
  handleError,
} from "../lib/errors.js";
import { validateEnvironment } from "../lib/validators.js";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Parse a `KEY=VALUE` assignment. Splits on the FIRST `=` only, so values may
 * contain `=` (connection strings, base64). Validates the key shape. Returns
 * a discriminated result rather than throwing, so it's unit-testable.
 */
export function parseAssignment(
  assignment: string
): { ok: true; key: string; value: string } | { ok: false; error: string } {
  const eq = assignment.indexOf("=");
  if (eq < 1) {
    return {
      ok: false,
      error:
        "Expected KEY=VALUE (e.g. envpilot var set API_URL=https://api.example.com)",
    };
  }
  const key = assignment.slice(0, eq);
  const value = assignment.slice(eq + 1);
  if (!KEY_PATTERN.test(key) || key.length > 100) {
    return {
      ok: false,
      error:
        "Variable key must be UPPER_SNAKE_CASE (A-Z, 0-9, _), start with a letter, max 100 chars.",
    };
  }
  return { ok: true, key, value };
}

interface VarOptions {
  env?: string;
  project?: string;
  description?: string;
  sensitive?: boolean;
  yes?: boolean;
}

/**
 * Resolve the target project + environment for a single-variable op, or exit
 * with a helpful message. Shared by every `var` subcommand.
 */
function resolveTarget(options: VarOptions): {
  projectId: string;
  projectName: string;
  environment: string;
} {
  if (!isAuthenticated()) throw notAuthenticated();

  const config = readProjectConfigV2();
  if (!config) throw notInitialized();

  const project = resolveProject(config, options.project);
  if (!project) {
    error(`Project not found: ${options.project ?? "(active)"}`);
    console.log();
    console.log("Linked projects:");
    for (const p of config.projects) {
      console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
    }
    process.exit(1);
  }

  const environment = options.env || project.environment;
  if (options.env && !validateEnvironment(options.env)) {
    throw invalidInput(
      `Unknown environment "${options.env}". Valid environments: development, staging, production.`
    );
  }

  return {
    projectId: project.projectId,
    projectName: project.projectName || project.projectId,
    environment,
  };
}

const setCommand = new Command("set")
  .description("Set (create or update) a single variable in one environment")
  .argument(
    "<key=value>",
    "Variable assignment, e.g. DATABASE_URL=postgres://…"
  )
  .option("-e, --env <environment>", "Environment (defaults to active)")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("-d, --description <text>", "Optional description")
  .option("--sensitive", "Mark the variable as sensitive")
  .action(async (assignment: string, options: VarOptions) => {
    try {
      const parsed = parseAssignment(assignment);
      if (!parsed.ok) throw invalidInput(parsed.error);
      const { key, value } = parsed;

      const { projectId, projectName, environment } = resolveTarget(options);
      const api = createAPIClient();
      const result = await withSpinner(
        `Setting ${key} in ${environment}...`,
        () =>
          api.setVariable(projectId, environment, key, value, {
            description: options.description,
            isSensitive: options.sensitive,
          })
      );

      const verb = result.created > 0 ? "Created" : "Updated";
      success(`${verb} ${key} in ${projectName}/${environment}.`);
    } catch (err) {
      await handleError(err);
    }
  });

const rmCommand = new Command("rm")
  .alias("delete")
  .description("Delete a single variable from one environment (moves to trash)")
  .argument("<key>", "Variable key to delete")
  .option("-e, --env <environment>", "Environment (defaults to active)")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (key: string, options: VarOptions) => {
    try {
      const { projectId, projectName, environment } = resolveTarget(options);
      const api = createAPIClient();

      const variableId = await withSpinner(`Finding ${key}...`, () =>
        api.findVariableId(projectId, environment, key)
      );
      if (!variableId) {
        error(
          `No variable ${key} found in ${projectName}/${environment} (or you lack access).`
        );
        process.exit(1);
      }

      if (!options.yes) {
        warning(
          `This moves ${key} (${environment}) to trash. Re-run with --yes to confirm.`
        );
        return;
      }

      await withSpinner(`Deleting ${key}...`, () =>
        api.removeVariable(variableId)
      );
      success(`Deleted ${key} from ${projectName}/${environment}.`);
      info("Recover it from the dashboard trash if this was a mistake.");
    } catch (err) {
      await handleError(err);
    }
  });

export const varCommand = new Command("var")
  .description("Manage a single variable (set, delete)")
  .addCommand(setCommand)
  .addCommand(rmCommand);
