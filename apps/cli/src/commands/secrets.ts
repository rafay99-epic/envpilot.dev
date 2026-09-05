import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import { error, success, info, warning, withSpinner } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  invalidInput,
  handleError,
  isProtectedEnvironmentError,
  formatProtectedEnvironments,
} from "../lib/errors.js";
import { resolveEnvironment, ENVIRONMENTS } from "../lib/validators.js";

/** Printed once a create/update-with-value action auto-files a proposal. */
export function requestedSuccessMessage(requestId: string): string {
  return `Sent for approval (request ${requestId}).`;
}

/** The confirm prompt / non-interactive message before proposing a delete. */
export function protectedDeletePrompt(environments: string[]): string {
  return `${formatProtectedEnvironments(environments)}. File a change request to delete it?`;
}

export const PROTECTED_DELETE_HINT =
  "Re-run with --yes to file a change request.";

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
        "Expected KEY=VALUE (e.g. envpilot secrets set API_URL=https://api.example.com)",
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

interface SecretsOptions {
  env?: string;
  project?: string;
  description?: string;
  sensitive?: boolean;
  yes?: boolean;
  allEnvs?: boolean;
}

/**
 * Resolve the target project + environment for a single-secret op, or exit
 * with a helpful message. Shared by every `secrets` subcommand.
 */
function resolveTarget(options: SecretsOptions): {
  projectId: string;
  projectName: string;
  environment: "development" | "staging" | "production";
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

  // Validates BOTH the -e flag and the stored config value (guards against a
  // hand-edited .envpilot). resolveEnvironment also folds shorthand like
  // "prod" into the canonical name the request path needs.
  const requested =
    options.env !== undefined ? options.env : project.environment;
  const environment = resolveEnvironment(requested);
  if (!environment) {
    throw invalidInput(
      `Unknown environment "${requested}". Valid environments: ${ENVIRONMENTS.join(", ")}.`
    );
  }

  return {
    projectId: project.projectId,
    projectName: project.projectName || project.projectId,
    environment,
  };
}

/**
 * RBAC pre-check for routing and readable errors ONLY — the Convex mutations
 * remain the enforcement boundary (one enforcement core; the CLI never
 * decides authorization, it just phrases the flow).
 */
async function resolveWriteRoute(projectId: string): Promise<{
  role: string;
  canWrite: boolean;
  canRequest: boolean;
  environmentScope: string[] | null;
}> {
  const api = createAPIClient();
  const roles = await api.resolveProjectRoles(projectId);
  const assigned = roles.assigned;
  return {
    role: roles.role,
    canWrite:
      assigned &&
      (roles.capabilities["project.variables.create"] === true ||
        roles.capabilities["project.variables.update"] === true),
    canRequest:
      assigned && roles.capabilities["project.requests.submit"] === true,
    environmentScope: roles.environmentScope,
  };
}

const setCommand = new Command("set")
  .description(
    "Set (create or update) a single secret. Two-step by default: the key is " +
      "validated first, then the value is prompted MASKED so it never lands " +
      "in shell history. KEY=VALUE inline works for CI."
  )
  .argument(
    "[key-or-assignment]",
    "KEY (value prompted masked) or KEY=VALUE (CI; lands in shell history)"
  )
  .option("-e, --env <environment>", "Environment (defaults to active)")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("-d, --description <text>", "Optional description")
  .option("--sensitive", "Mark the secret as sensitive")
  .option(
    "--all-envs",
    "Confirm updating a variable whose value is shared across multiple environments"
  )
  .action(
    async (keyOrAssignment: string | undefined, options: SecretsOptions) => {
      try {
        const { projectId, projectName, environment } = resolveTarget(options);

        // Gate 1 — RBAC routing (server still enforces; this shapes UX).
        const route = await withSpinner("Checking role and plan...", () =>
          resolveWriteRoute(projectId)
        );
        if (!route.canWrite && !route.canRequest) {
          error(
            `Your role (${route.role}) cannot write variables or file requests in this project.`
          );
          process.exit(3);
        }
        if (
          route.environmentScope &&
          !route.environmentScope.includes(environment)
        ) {
          error(
            `Your assignment is scoped to [${route.environmentScope.join(", ")}] — ${environment} is outside it.`
          );
          process.exit(3);
        }

        // Step 1 — the key (validated BEFORE any secret is typed).
        let key: string;
        let inlineValue: string | undefined;
        if (keyOrAssignment && keyOrAssignment.includes("=")) {
          const parsed = parseAssignment(keyOrAssignment);
          if (!parsed.ok) throw invalidInput(parsed.error);
          key = parsed.key;
          inlineValue = parsed.value;
          warning(
            "Value passed on the command line — it is now in your shell history. " +
              "Prefer `envpilot secrets set KEY` to be prompted masked."
          );
        } else if (keyOrAssignment) {
          if (
            !KEY_PATTERN.test(keyOrAssignment) ||
            keyOrAssignment.length > 100
          ) {
            throw invalidInput(
              "Variable key must be UPPER_SNAKE_CASE (A-Z, 0-9, _), start with a letter, max 100 chars."
            );
          }
          key = keyOrAssignment;
        } else {
          if (!process.stdin.isTTY) {
            throw invalidInput(
              "No key provided. Non-interactive usage: envpilot secrets set KEY=VALUE"
            );
          }
          const answer = await inquirer.prompt<{ key: string }>([
            {
              type: "input",
              name: "key",
              message: "Key:",
              validate: (input: string) =>
                (KEY_PATTERN.test(input) && input.length <= 100) ||
                "Must be UPPER_SNAKE_CASE (A-Z, 0-9, _), start with a letter, max 100 chars.",
            },
          ]);
          key = answer.key;
        }

        // Shared-variable guard: a value can be shared by several
        // environments on ONE variable — updating it here updates all of
        // them. Detect that BEFORE the value is typed and require explicit
        // consent (--all-envs, or an interactive confirm).
        const existing = await withSpinner(`Checking ${key}...`, () =>
          createAPIClient().findVariable(projectId, environment, key)
        );
        if (existing && existing.environments.length > 1 && !options.allEnvs) {
          const envList = existing.environments.join(", ");
          if (process.stdin.isTTY) {
            const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
              {
                type: "confirm",
                name: "proceed",
                message: `${key}'s value is shared across [${envList}] — updating it changes ALL of them. Continue?`,
                default: false,
              },
            ]);
            if (!proceed) {
              info(
                "Nothing changed. To give this environment its own value, edit the variable's environments in the dashboard first."
              );
              return;
            }
          } else {
            error(
              `${key} is shared across [${envList}] — updating it changes all of them. Re-run with --all-envs to confirm.`
            );
            process.exit(1);
          }
        }

        // Step 2 — the value, masked (never echoed, never in history).
        let value: string;
        let isSensitive = options.sensitive ?? false;
        if (inlineValue !== undefined) {
          value = inlineValue;
        } else {
          if (!process.stdin.isTTY) {
            throw invalidInput(
              "No value provided. Non-interactive usage: envpilot secrets set KEY=VALUE"
            );
          }
          const answers = await inquirer.prompt<{
            value: string;
            isSensitive?: boolean;
          }>([
            {
              type: "password",
              name: "value",
              message: "Value:",
              mask: "*",
              validate: (input: string) =>
                input.length > 0 || "Value cannot be empty.",
            },
            ...(options.sensitive === undefined
              ? [
                  {
                    type: "confirm" as const,
                    name: "isSensitive" as const,
                    message: "Mark as sensitive?",
                    default: false,
                  },
                ]
              : []),
          ]);
          value = answers.value;
          if (options.sensitive === undefined) {
            isSensitive = answers.isSensitive ?? false;
          }
        }

        const api = createAPIClient();

        if (route.canWrite) {
          // Direct write — plan/tier limits enforced server-side; a tier
          // denial arrives as a readable ConvexError via handleError. A
          // protected environment is not an error here: create/update-with-
          // value auto-files a change request instead of writing, and the
          // result carries `requested` rather than `_id`.
          const result = await withSpinner(
            `Setting ${key} in ${environment}...`,
            () =>
              existing
                ? api.updateVariableValue(existing._id, {
                    value,
                    description: options.description,
                    isSensitive,
                  })
                : api.createVariableValue(
                    projectId,
                    [environment],
                    key,
                    value,
                    { description: options.description, isSensitive }
                  )
          );
          if ("requested" in result) {
            success(requestedSuccessMessage(result.requestId));
            info("Waiting for a second person to approve.");
          } else {
            const verb = existing ? "Updated" : "Created";
            success(
              `${verb} ${chalk.bold(key)} in ${projectName}/${environment}.`
            );
          }
          return;
        }

        // Request-only role — route into the request workflow instead of
        // rejecting. Interactive: confirm first. Non-interactive: file it
        // directly with a notice (prompting would hang CI).
        if (process.stdin.isTTY && inlineValue === undefined) {
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
            {
              type: "confirm",
              name: "proceed",
              message:
                "Your role can't write variables directly — file this as a request for review?",
              default: true,
            },
          ]);
          if (!proceed) {
            info("Nothing submitted.");
            return;
          }
        } else {
          warning(
            "Your role can't write variables directly — filing this as a request for review."
          );
        }

        const request = await withSpinner("Submitting request...", () =>
          api.createVariableRequest({
            projectId,
            key,
            value,
            environments: [environment],
            isSensitive,
            description: options.description,
          })
        );
        success(`Request submitted for ${chalk.bold(key)} (${environment}).`);
        info(
          `A reviewer can approve it with: envpilot requests approve ${request._id}`
        );
      } catch (err) {
        await handleError(err);
      }
    }
  );

const rmCommand = new Command("rm")
  .alias("delete")
  .description("Delete a single secret from one environment (moves to trash)")
  .argument("<key>", "Variable key to delete")
  .option("-e, --env <environment>", "Environment (defaults to active)")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (key: string, options: SecretsOptions) => {
    try {
      const { projectId, projectName, environment } = resolveTarget(options);

      // RBAC pre-check for a readable denial (server still enforces).
      const api = createAPIClient();
      const roles = await withSpinner("Checking role...", () =>
        api.resolveProjectRoles(projectId)
      );
      if (
        !roles.assigned ||
        roles.capabilities["project.variables.delete"] !== true
      ) {
        error(
          `Your role (${roles.role}) cannot delete variables in this project.`
        );
        process.exit(3);
      }

      const found = await withSpinner(`Finding ${key}...`, () =>
        api.findVariable(projectId, environment, key)
      );
      if (!found) {
        error(
          `No variable ${key} found in ${projectName}/${environment} (or you lack access).`
        );
        process.exit(1);
      }

      // A variable shared across environments is RE-SCOPED (this environment
      // is removed from it), not deleted — its value stays live elsewhere.
      const shared = found.environments.length > 1;
      const consequence = shared
        ? `remove ${key} from ${environment} (still live in: ${found.environments.filter((e) => e !== environment).join(", ")})`
        : `move ${key} (${environment}) to trash`;

      if (!options.yes) {
        if (!process.stdin.isTTY) {
          warning(`This will ${consequence}. Re-run with --yes to confirm.`);
          return;
        }
        const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
          {
            type: "confirm",
            name: "proceed",
            message: `${consequence[0].toUpperCase()}${consequence.slice(1)} — continue?`,
            default: false,
          },
        ]);
        if (!proceed) {
          info("Nothing deleted.");
          return;
        }
      }

      try {
        if (shared) {
          await withSpinner(`Removing ${key} from ${environment}...`, () =>
            api.removeVariableFromEnvironment(found._id, environment)
          );
          success(
            `Removed ${chalk.bold(key)} from ${environment} — still live in: ${found.environments.filter((e) => e !== environment).join(", ")}.`
          );
        } else {
          await withSpinner(`Deleting ${key}...`, () =>
            api.removeVariable(found._id)
          );
          success(
            `Deleted ${chalk.bold(key)} from ${projectName}/${environment}.`
          );
          info("Recover it from the dashboard trash if this was a mistake.");
        }
      } catch (err) {
        if (!isProtectedEnvironmentError(err)) throw err;

        const prompt = protectedDeletePrompt(err.data.environments);
        if (!options.yes) {
          if (!process.stdin.isTTY) {
            error(prompt);
            info(PROTECTED_DELETE_HINT);
            process.exit(1);
          }
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
            {
              type: "confirm",
              name: "proceed",
              message: prompt,
              default: true,
            },
          ]);
          if (!proceed) {
            info("Nothing deleted.");
            return;
          }
        }

        const { requestId } = shared
          ? await withSpinner("Filing change request...", () =>
              api.createVariableChange({
                projectId,
                kind: "update",
                variableId: found._id,
                environments: found.environments.filter(
                  (e) => e !== environment
                ),
              })
            )
          : await withSpinner("Filing change request...", () =>
              api.createVariableChange({
                projectId,
                kind: "delete",
                variableId: found._id,
              })
            );
        success(requestedSuccessMessage(requestId));
        info("Waiting for a second person to approve.");
      }
    } catch (err) {
      await handleError(err);
    }
  });

// `secrets` matches the category convention (Doppler and Infisical both use
// `secrets set` / `secrets delete`); `var` stays as a silent alias so the
// earlier spelling keeps working.
export const secretsCommand = new Command("secrets")
  .alias("var")
  .description("Manage a single secret (set, delete)")
  .addCommand(setCommand)
  .addCommand(rmCommand);
