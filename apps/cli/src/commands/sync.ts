import { Command } from "commander";
import chalk from "chalk";
import {
  success,
  info,
  warning,
  withSpinner,
  diff as showDiff,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import {
  isAuthenticated,
  setActiveOrganizationId,
  setActiveProjectId,
  setUnifiedRole,
} from "../lib/config.js";
import {
  readProjectConfigV2,
  writeProjectConfigV2,
  ensureEnvInGitignore,
  getActiveProject,
} from "../lib/project-config.js";
import {
  readEnvFile,
  writeEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
  applyFileProtection,
} from "../lib/env-file.js";
import {
  normalizeOrgRole,
  formatRoleLabel,
  isFileWritable,
  type ProjectAccess,
} from "../lib/roles.js";
import { performLogin } from "../lib/auth-flow.js";
import { selectOrgProjectEnv } from "./init.js";
import { installCommitGuard } from "../lib/commit-guard.js";
import { handleError } from "../lib/errors.js";
import type {
  Variable,
  Environment,
  Organization,
  VariablesMeta,
} from "../types/index.js";

type CliVariablesMeta = VariablesMeta & {
  role?: string | null;
  projectRole?: string | null;
};

function accessFromMeta(
  meta: CliVariablesMeta | undefined,
  variables: Variable[]
): ProjectAccess {
  const role = normalizeOrgRole(meta?.unifiedRole ?? meta?.role);
  return {
    role,
    // Owners are implicitly assigned to every project. The legacy server sends
    // no `assigned`/`projectRole` for owners, so fall back to true for them.
    assigned:
      role === "owner" ||
      (meta?.assigned ??
        (meta?.projectRole !== null && meta?.projectRole !== undefined)),
    environmentScope: meta?.environmentScope ?? null,
    hasWriteAccess:
      meta?.hasWriteAccess ?? variables.some((v) => v.access === "write"),
  };
}

function orgUnifiedRole(org: Organization): ProjectAccess["role"] {
  const unified = (org as Organization & { unifiedRole?: string | null })
    .unifiedRole;
  return normalizeOrgRole(unified ?? org.role);
}

export const syncCommand = new Command("sync")
  .description(
    "Login, select project, pull variables, and protect files — all in one command"
  )
  .option("-o, --organization <id>", "Organization ID")
  .option("-p, --project <id>", "Project ID or name")
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)"
  )
  .option("--force", "Overwrite without confirmation")
  .option("--no-guard", "Skip pre-commit hook installation")
  .action(async (options) => {
    try {
      // ── Step 1: Login ──────────────────────────────────────────────
      if (!isAuthenticated()) {
        console.log();
        info("Not logged in. Starting authentication...");
        console.log();
        await performLogin();
        console.log();
      } else {
        info("Already authenticated.");
      }

      // ── Step 2: Install commit guard + .gitignore ──────────────────
      ensureEnvInGitignore();

      if (options.guard !== false) {
        const guardResult = installCommitGuard();
        if (guardResult.installed) {
          success(guardResult.message);
          info("Staged .env files will be blocked from commits.");
        } else if (guardResult.message !== "Not a git repository") {
          warning(guardResult.message);
        }
      }

      console.log();

      // ── Step 3: Select org / project / environment ─────────────────
      let projectId: string;
      let organizationId: string;
      let environment: Environment;
      let projectName: string;
      let organizationName: string;

      const existingConfig = readProjectConfigV2();

      if (
        existingConfig &&
        !options.organization &&
        !options.project &&
        !options.env
      ) {
        // Already initialized — use active project
        const active = getActiveProject(existingConfig);
        if (active) {
          projectId = active.projectId;
          organizationId = active.organizationId;
          environment = active.environment;
          projectName = active.projectName;
          organizationName = active.organizationName;

          info(
            `Using project ${chalk.bold(projectName || projectId)} (${environment})`
          );
        } else {
          const selection = await selectOrgProjectEnv(options);
          projectId = selection.selectedProject._id;
          organizationId = selection.selectedOrg._id;
          environment = selection.selectedEnvironment;
          projectName = selection.selectedProject.name;
          organizationName = selection.selectedOrg.name;
        }
      } else {
        // First time or user wants to pick — interactive selection
        const selection = await selectOrgProjectEnv({
          organization: options.organization,
          project: options.project,
          environment: options.env,
        });

        projectId = selection.selectedProject._id;
        organizationId = selection.selectedOrg._id;
        environment = selection.selectedEnvironment;
        projectName = selection.selectedProject.name;
        organizationName = selection.selectedOrg.name;

        setUnifiedRole(orgUnifiedRole(selection.selectedOrg));

        // Save config
        writeProjectConfigV2({
          version: 1 as const,
          activeProjectId: projectId,
          projects: existingConfig
            ? [
                ...existingConfig.projects.filter(
                  (p) => p.projectId !== projectId
                ),
                {
                  projectId,
                  organizationId,
                  projectName,
                  organizationName,
                  environment,
                },
              ]
            : [
                {
                  projectId,
                  organizationId,
                  projectName,
                  organizationName,
                  environment,
                },
              ],
        });

        setActiveOrganizationId(organizationId);
        setActiveProjectId(projectId);
      }

      // ── Step 4: Pull variables ─────────────────────────────────────
      console.log();
      let meta: CliVariablesMeta | undefined;

      const variables = await withSpinner(
        `Fetching ${chalk.bold(environment)} variables...`,
        async () => {
          const api = createAPIClient();
          const response = await api.listVariables(
            projectId,
            environment,
            organizationId
          );
          meta = response.meta;
          return response.variables;
        }
      );

      const outputPath = getEnvPathForEnvironment(environment);

      if (meta?.scopeRestricted && meta.environmentScope?.length) {
        info(
          `Your access is scoped to ${meta.environmentScope.join(", ")}; variables in other environments are withheld.`
        );
      }

      if (variables.length === 0) {
        warning(`No variables found for ${environment} environment.`);
        console.log();
        return;
      }

      // Build remote vars
      const remoteVars: Record<string, string> = {};
      for (const variable of variables) {
        remoteVars[variable.key] = variable.value;
      }

      const localVars = readEnvFile(outputPath) || {};
      const diffResult = diffEnvVars(remoteVars, localVars);
      const hasChanges =
        Object.keys(diffResult.added).length > 0 ||
        Object.keys(diffResult.removed).length > 0 ||
        Object.keys(diffResult.changed).length > 0;

      if (!hasChanges) {
        success(`${chalk.bold(outputPath)} is up to date.`);
        console.log();
        return;
      }

      // Show diff
      console.log();
      console.log(chalk.bold("Changes:"));
      console.log();
      showDiff(diffResult.added, diffResult.removed, diffResult.changed);
      console.log();

      // Make file writable before writing (may be read-only from previous sync)
      try {
        const fs = await import("node:fs");
        if (fs.existsSync(outputPath)) {
          fs.chmodSync(outputPath, 0o644);
        }
      } catch {
        // Ignore
      }

      // Write env file
      const comments: Record<string, string> = {};
      for (const variable of variables) {
        if (variable.description) {
          comments[variable.key] = variable.description;
        }
      }
      writeEnvFile(outputPath, remoteVars, { sort: true, comments });

      // Apply access-based file protection derived from THIS request's meta
      // (never a stale global role), honoring the project's fileProtection
      // preference.
      const access = accessFromMeta(meta, variables);
      const protection =
        existingConfig?.projects.find((p) => p.projectId === projectId)
          ?.fileProtection ?? "auto";
      applyFileProtection(outputPath, access, protection);

      success(
        `Synced ${variables.length} variables to ${chalk.bold(outputPath)}`
      );

      // Grant-only users only see variables explicitly shared with them.
      if (meta?.grantOnly) {
        info(
          "You have grant-only access to this project. You only see variables explicitly shared with you."
        );
      }

      // Show protection status.
      const writable =
        protection === "never" ||
        (protection !== "always" && isFileWritable(access));
      if (!writable) {
        info(
          `File is read-only (your role: ${formatRoleLabel(access.role)}${
            access.assigned ? "" : ", not assigned to this project"
          }).`
        );
      }

      console.log();
      console.log(
        chalk.dim(`  Added:   ${Object.keys(diffResult.added).length}`)
      );
      console.log(
        chalk.dim(`  Changed: ${Object.keys(diffResult.changed).length}`)
      );
      console.log(
        chalk.dim(`  Removed: ${Object.keys(diffResult.removed).length}`)
      );
      console.log();
    } catch (err) {
      await handleError(err);
    }
  });
