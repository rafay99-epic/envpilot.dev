import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { success, error, info, warning } from "../lib/ui.js";
import { createAPIClient, APIError } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
} from "../lib/errors.js";
import { normalizeOrgRole } from "../lib/roles.js";
import {
  allowedRequestEnvironments,
  buildCreateVariableRequestBody,
  validateRequestDescription,
  validateRequestKey,
  validateRequestValue,
} from "../lib/variable-requests.js";
import type { ProjectEntry, Variable, VariablesMeta } from "../types/index.js";

/**
 * The /api/cli/variables meta block, including the legacy role/projectRole
 * fields the server still returns (passthrough keys not surfaced by the typed
 * VariablesMeta schema). Mirrors pull.ts's CliVariablesMeta.
 */
type CliVariablesMeta = VariablesMeta & {
  role?: string | null;
  projectRole?: string | null;
};

export const requestCommand = new Command("request")
  .description(
    "Request creation of a new environment variable (developers only — owners, project managers, and team leads create variables directly)"
  )
  .option(
    "--project <name-or-id>",
    "Submit the request for a specific linked project"
  )
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const project = resolveLinkedProject(options.project);

      const api = createAPIClient();

      // Determine the caller's unified role + environment scope from the
      // /api/cli/variables meta block (the same meta pull.ts already reads).
      const metaResponse = await api.get<{
        success: boolean;
        data: Variable[];
        meta?: CliVariablesMeta;
      }>("/api/cli/variables", {
        projectId: project.projectId,
        ...(project.organizationId && {
          organizationId: project.organizationId,
        }),
      });
      const meta = metaResponse.meta;
      const role = normalizeOrgRole(meta?.unifiedRole ?? meta?.role);

      if (role !== "developer") {
        warning(
          "You have direct write access to this project. Use `envpilot push` or create the variable directly instead of submitting a request."
        );
        return;
      }

      const envChoices = allowedRequestEnvironments(meta?.environmentScope);
      if (envChoices.length === 0) {
        error(
          "Your assignment does not include any environments in this project."
        );
        process.exit(1);
      }

      const answers = await inquirer.prompt<{
        key: string;
        value: string;
        description: string;
        environments: string[];
        isSensitive: boolean;
      }>([
        {
          type: "input",
          name: "key",
          message: "Variable key (e.g. API_SECRET):",
          validate: (input: string) => {
            const result = validateRequestKey(input);
            return result.valid || result.error;
          },
        },
        {
          type: "password",
          name: "value",
          message: "Variable value:",
          mask: "*",
          validate: (input: string) => {
            const result = validateRequestValue(input);
            return result.valid || result.error;
          },
        },
        {
          type: "input",
          name: "description",
          message: "Description (optional):",
          default: "",
          validate: (input: string) => {
            const result = validateRequestDescription(input);
            return result.valid || result.error;
          },
        },
        {
          type: "checkbox",
          name: "environments",
          message: "Environments:",
          choices: envChoices,
          validate: (input: readonly string[]) =>
            input.length > 0 || "Select at least one environment",
        },
        {
          type: "confirm",
          name: "isSensitive",
          message: "Is this value sensitive?",
          default: true,
        },
      ]);

      const body = buildCreateVariableRequestBody({
        projectId: project.projectId,
        key: answers.key,
        value: answers.value,
        description: answers.description,
        environments: answers.environments,
        isSensitive: answers.isSensitive,
      });

      const created = await api.createVariableRequest(body);

      success(`Request submitted: ${chalk.bold(created.key)}`);
      info(`Status: ${created.status} · Id: ${created._id}`);
      info(
        "A project owner, project manager, or team lead must approve it before the variable is created."
      );
    } catch (err) {
      // The server is the source of truth for authorization — surface its
      // 403 message directly instead of a generic stack trace.
      if (err instanceof APIError && err.statusCode === 403) {
        error(err.message);
        return;
      }
      await handleError(err);
    }
  });

function resolveLinkedProject(projectOption?: string): ProjectEntry {
  const configV2 = readProjectConfigV2();
  if (!configV2) throw notInitialized();

  const project = resolveProject(configV2, projectOption);
  if (!project) {
    error(`Project not found: ${projectOption}`);
    console.log();
    console.log("Linked projects:");
    for (const p of configV2.projects) {
      console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
    }
    process.exit(1);
  }

  return project;
}
