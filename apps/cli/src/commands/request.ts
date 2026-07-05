import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { success, error, info, warning, withSpinner } from "../lib/ui.js";
import { createAPIClient, APIClient, APIError } from "../lib/api.js";
import { isAuthenticated, getUser } from "../lib/config.js";
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
  buildEligibleRequestTargets,
  buildProjectChoices,
  formatRequestContextBanner,
  formatRequestSuccessMessage,
  formatRequestSummary,
  validateRequestDescription,
  validateRequestKey,
  validateRequestValue,
  type RequestTarget,
} from "../lib/variable-requests.js";
import type { ProjectEntry, VariablesMeta } from "../types/index.js";

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

      const email = getUser()?.email ?? "unknown account";
      const api = createAPIClient();
      const projectPassed = Boolean(options.project);

      // Resolve the default target from the linked config (cwd / --project).
      const defaultEntry = resolveDefaultEntry(options.project);

      // The chosen target + the developer's environment scope for it. Scope
      // comes from the /api/cli/variables meta for the linked project, or from
      // the /api/cli/projects listing when the user switches via the picker.
      let target: RequestTarget | null = null;
      let scope: string[] | null | undefined;

      if (defaultEntry) {
        const names = await resolveEntryNames(api, defaultEntry);
        const defaultTarget: RequestTarget = {
          projectId: defaultEntry.projectId,
          projectName: names.projectName,
          organizationId: defaultEntry.organizationId,
          organizationName: names.organizationName,
        };

        printBanner(email, defaultTarget);

        // --project is scripting-friendly: banner only, no confirm.
        let useDefault = projectPassed;
        if (!projectPassed) {
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
            {
              type: "confirm",
              name: "proceed",
              message: "Request a variable for this project?",
              default: true,
            },
          ]);
          useDefault = proceed;
        }

        if (useDefault) {
          const meta = await fetchProjectMeta(api, defaultEntry);
          const role = normalizeOrgRole(meta?.unifiedRole ?? meta?.role);
          if (role !== "developer") {
            warning(
              "You have direct write access to this project. Use `envpilot push` or create the variable directly instead of submitting a request."
            );
            return;
          }
          target = defaultTarget;
          scope = meta?.environmentScope;
        }
      }

      // No linked project, or the user declined the default → interactive
      // picker over every project they are an assigned developer on.
      if (!target) {
        const picked = await pickRequestTarget(api);
        if (!picked) {
          info(
            "You have direct write access in your projects — create variables from the dashboard."
          );
          process.exit(0);
        }
        target = picked;
        scope = picked.environmentScope;
        printBanner(email, target);
      }

      // Environments the developer may request, scoped to the PICKED project.
      const envChoices = allowedRequestEnvironments(scope);
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

      // Final confirmation summary before submit.
      console.log();
      console.log(
        formatRequestSummary({
          key: answers.key.trim(),
          projectName: target.projectName,
          organizationName: target.organizationName,
          environments: answers.environments,
          isSensitive: answers.isSensitive,
        })
      );
      console.log();

      const { submit } = await inquirer.prompt<{ submit: boolean }>([
        {
          type: "confirm",
          name: "submit",
          message: "Submit this request?",
          default: true,
        },
      ]);

      if (!submit) {
        info("Request canceled.");
        return;
      }

      const body = buildCreateVariableRequestBody({
        projectId: target.projectId,
        key: answers.key,
        value: answers.value,
        description: answers.description,
        environments: answers.environments,
        isSensitive: answers.isSensitive,
      });

      const created = await api.createVariableRequest(body);

      success(
        formatRequestSuccessMessage({
          key: created.key,
          projectName: target.projectName,
          organizationName: target.organizationName,
        })
      );
      info(`Status: ${created.status} · Id: ${created._id}`);
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

/**
 * Resolve the default linked project from the .envpilot config. When --project
 * is passed we require a config and a matching entry; without --project a
 * missing config simply means "no default" (the caller falls back to the
 * picker), so we return null rather than throwing.
 */
function resolveDefaultEntry(projectOption?: string): ProjectEntry | null {
  const configV2 = readProjectConfigV2();
  if (!configV2) {
    if (projectOption) throw notInitialized();
    return null;
  }

  const project = resolveProject(configV2, projectOption);
  if (!project) {
    if (projectOption) {
      error(`Project not found: ${projectOption}`);
      console.log();
      console.log("Linked projects:");
      for (const p of configV2.projects) {
        console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
      }
      process.exit(1);
    }
    return null;
  }

  return project;
}

/** Print the always-visible context banner before any prompt. */
function printBanner(email: string, target: RequestTarget): void {
  console.log();
  console.log(
    chalk.dim(
      formatRequestContextBanner({
        email,
        projectName: target.projectName,
        organizationName: target.organizationName,
      })
    )
  );
  console.log();
}

/**
 * Resolve display names for a linked project, filling any the config lacks
 * (older/migrated .envpilot entries) from the API, and falling back to raw ids.
 */
async function resolveEntryNames(
  api: APIClient,
  entry: ProjectEntry
): Promise<{ projectName: string; organizationName: string }> {
  let projectName = entry.projectName;
  let organizationName = entry.organizationName;

  if (!projectName) {
    try {
      const project = await api.getProject(entry.projectId);
      projectName = project.name;
    } catch {
      // Fall through to the id fallback below.
    }
  }

  if (!organizationName) {
    try {
      const orgs = await api.listOrganizations();
      organizationName =
        orgs.find((o) => o._id === entry.organizationId)?.name ?? "";
    } catch {
      // Fall through to the id fallback below.
    }
  }

  return {
    projectName: projectName || entry.projectId,
    organizationName: organizationName || entry.organizationId,
  };
}

/** Fetch the caller's role + environment scope for a linked project. */
async function fetchProjectMeta(
  api: APIClient,
  entry: ProjectEntry
): Promise<CliVariablesMeta | undefined> {
  const response = await api.listVariables(
    entry.projectId,
    undefined,
    entry.organizationId
  );
  return response.meta;
}

/**
 * Interactive picker over every project the user is an assigned developer on,
 * across all their organizations. Returns the chosen target, or null when there
 * are no eligible projects.
 */
async function pickRequestTarget(
  api: APIClient
): Promise<RequestTarget | null> {
  const targets = await withSpinner(
    "Finding projects you can request for...",
    async () => {
      const orgs = await api.listOrganizations();
      const orgNameById = Object.fromEntries(orgs.map((o) => [o._id, o.name]));
      const perOrg = await Promise.all(
        orgs.map((org) => api.listProjects(org._id))
      );
      return perOrg.flatMap((projects) =>
        buildEligibleRequestTargets(projects, orgNameById)
      );
    }
  );

  if (targets.length === 0) return null;

  const { projectId } = await inquirer.prompt<{ projectId: string }>([
    {
      type: "list",
      name: "projectId",
      message: "Select a project to request for:",
      choices: buildProjectChoices(targets),
    },
  ]);

  return targets.find((t) => t.projectId === projectId) ?? null;
}
