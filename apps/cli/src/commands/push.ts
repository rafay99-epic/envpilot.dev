import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  success,
  error,
  info,
  warning,
  withSpinner,
  diff as showDiff,
  table,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import {
  readProjectConfig,
  readProjectConfigV2,
  resolveProject,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import {
  readEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
} from "../lib/env-file.js";
import {
  parse,
  getDefaultFilename,
  ALL_FORMATS,
  type FormatType,
} from "../lib/format-converter.js";
import { validateEnvVars } from "../lib/validators.js";
import {
  notAuthenticated,
  notInitialized,
  fileNotFound,
  handleError,
  isProtectedEnvironmentError,
  formatProtectedEnvironments,
} from "../lib/errors.js";
import type { PushBulkResult } from "../lib/api.js";
import type { VariablesMeta } from "../types/index.js";

/** The refusal shown when a push is denied outright (no `--request`). */
export function protectedPushRefusalMessage(environments: string[]): string {
  return `${formatProtectedEnvironments(environments)}. Nothing was pushed. Re-run with --request to propose these changes for approval.`;
}

/** Rows for the `--request` result table: key + the filed request's id. */
export function formatRequestedRows(
  requested: PushBulkResult["requested"]
): Array<{ key: string; requestId: string }> {
  return (requested ?? []).map((r) => ({ key: r.key, requestId: r.requestId }));
}

export const pushCommand = new Command("push")
  .description("Upload local .env file to cloud")
  .option(
    "-e, --env <environment>",
    "Target environment (development, staging, production)"
  )
  .option("-f, --file <path>", "Input file path (default: .env)")
  .option("--merge", "Merge with existing variables (default)")
  .option("--replace", "Replace all existing variables")
  .option(
    "--format <format>",
    "Input format: env, json, yaml, docker-compose, aws, vercel, netlify",
    "env"
  )
  .option(
    "--prefix <prefix>",
    "AWS Parameter Store path prefix (default: /project-name)"
  )
  .option("--dry-run", "Show what would be uploaded without making changes")
  .option("--force", "Skip confirmation")
  .option("--project <name-or-id>", "Push to a specific linked project")
  .option(
    "--request",
    "Propose changes for approval instead of failing when the target environment is protected"
  )
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // Resolve project config
      let projectId: string;
      let organizationId: string;
      let defaultEnvironment: string;

      if (options.project) {
        const configV2 = readProjectConfigV2();
        if (!configV2) throw notInitialized();

        const resolved = resolveProject(configV2, options.project);
        if (!resolved) {
          error(`Project not found: ${options.project}`);
          console.log();
          console.log("Linked projects:");
          for (const p of configV2.projects) {
            console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
          }
          process.exit(1);
        }

        projectId = resolved.projectId;
        organizationId = resolved.organizationId;
        defaultEnvironment = resolved.environment;
      } else {
        const projectConfig = readProjectConfig();
        if (!projectConfig) throw notInitialized();

        projectId = projectConfig.projectId;
        organizationId = projectConfig.organizationId;
        defaultEnvironment = projectConfig.environment;
      }

      // Check for .env files tracked by git
      const trackedFiles = getTrackedEnvFiles();
      if (trackedFiles.length > 0) {
        error("Security risk: .env files are tracked by git!");
        console.log();
        for (const file of trackedFiles) {
          console.log(chalk.red(`  tracked: ${file}`));
        }
        console.log();
        console.log(
          chalk.yellow(
            "  Run the following to untrack them (without deleting the files):"
          )
        );
        for (const file of trackedFiles) {
          console.log(chalk.cyan(`    git rm --cached ${file}`));
        }
        console.log();
        process.exit(1);
      }

      const api = createAPIClient();

      const environment = options.env || defaultEnvironment || "development";
      const fmt = (options.format || "env") as FormatType;
      if (!ALL_FORMATS.includes(fmt)) {
        error(`Unknown format: ${fmt}. Supported: ${ALL_FORMATS.join(", ")}`);
        process.exit(1);
      }
      const inputPath =
        options.file ||
        (fmt === "env"
          ? getEnvPathForEnvironment(environment)
          : getDefaultFilename(fmt, environment));
      const mode = options.replace ? "replace" : "merge";

      // Read local file
      let localVars: Record<string, string> | null;
      if (fmt === "env") {
        localVars = readEnvFile(inputPath);
      } else {
        const { readFileSync, existsSync } = await import("node:fs");
        if (!existsSync(inputPath)) {
          localVars = null;
        } else {
          const content = readFileSync(inputPath, "utf-8");
          localVars = parse(content, fmt, { prefix: options.prefix });
        }
      }
      if (!localVars) {
        throw fileNotFound(inputPath);
      }

      if (Object.keys(localVars).length === 0) {
        warning(`No variables found in ${inputPath}`);
        return;
      }

      // Validate variables
      const { valid, invalid } = validateEnvVars(localVars);

      if (invalid.length > 0) {
        warning("Some variables have invalid keys and will be skipped:");
        for (const { key, error: err } of invalid) {
          console.log(chalk.red(`  ${key}: ${err}`));
        }
        console.log();
      }

      if (Object.keys(valid).length === 0) {
        error("No valid variables to push.");
        return;
      }

      // Fetch current remote variables for comparison (and the caller's access
      // meta for the target environment, used to gate the push).
      let meta: VariablesMeta | undefined;
      const remoteVariables = await withSpinner(
        "Fetching current variables...",
        async () => {
          const response = await api.listVariables(
            projectId,
            environment,
            organizationId
          );
          meta = response.meta;
          return response.variables;
        }
      );

      // Gate the push under the unified model. Only block when the user has no
      // write path: a scoped developer whose assignment excludes this env, or an
      // otherwise read-only caller. A legacy server that omits meta leaves both
      // checks inert (undefined), preserving the previous permissive behavior.
      const scope = meta?.environmentScope;
      if (Array.isArray(scope) && !scope.includes(environment)) {
        error(
          `Your developer access is scoped to ${scope.join(", ")}. ${environment} variables are withheld.`
        );
        process.exit(1);
      }
      if (meta?.hasWriteAccess === false) {
        error(`You have read-only access to ${environment} in this project.`);
        process.exit(1);
      }

      // Convert remote vars to object
      const remoteVars: Record<string, string> = {};
      for (const variable of remoteVariables) {
        remoteVars[variable.key] = variable.value;
      }

      // Calculate diff (local is what we want, remote is current state)
      const diffResult = diffEnvVars(valid, remoteVars);
      const hasChanges =
        Object.keys(diffResult.added).length > 0 ||
        Object.keys(diffResult.changed).length > 0 ||
        (mode === "replace" && Object.keys(diffResult.removed).length > 0);

      if (!hasChanges) {
        success("Remote is up to date.");
        return;
      }

      // Show diff
      console.log();
      console.log(chalk.bold("Changes to push:"));
      console.log();

      const removedToShow = mode === "replace" ? diffResult.removed : {};
      showDiff(diffResult.added, removedToShow, diffResult.changed);

      if (mode === "merge" && Object.keys(diffResult.removed).length > 0) {
        console.log();
        console.log(
          chalk.dim(
            `Note: ${Object.keys(diffResult.removed).length} remote variables not in local file will be preserved (use --replace to remove them)`
          )
        );
      }

      console.log();

      // Dry run
      if (options.dryRun) {
        info("Dry run - no changes made.");
        console.log();
        console.log("Summary:");
        console.log(`  Would add:    ${Object.keys(diffResult.added).length}`);
        console.log(
          `  Would update: ${Object.keys(diffResult.changed).length}`
        );
        if (mode === "replace") {
          console.log(
            `  Would delete: ${Object.keys(diffResult.removed).length}`
          );
        }
        return;
      }

      // Confirm unless --force
      if (!options.force) {
        const confirmMessage =
          mode === "replace"
            ? `Push ${Object.keys(valid).length} variables and delete ${Object.keys(diffResult.removed).length} remote-only variables?`
            : `Push ${Object.keys(valid).length} variables to ${environment}?`;

        const { proceed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "proceed",
            message: confirmMessage,
            default: true,
          },
        ]);

        if (!proceed) {
          info("Push cancelled.");
          return;
        }
      }

      // Push variables
      let result: PushBulkResult;
      try {
        result = await withSpinner(
          `Pushing variables to ${chalk.bold(environment)}...`,
          async () => {
            return api.bulkUpsertVariables({
              projectId,
              environment,
              variables: Object.entries(valid).map(([key, value]) => ({
                key,
                value,
              })),
              mode,
              request: options.request === true,
              ...(organizationId && { organizationId }),
            });
          }
        );
      } catch (err) {
        if (isProtectedEnvironmentError(err) && options.request !== true) {
          error(protectedPushRefusalMessage(err.data.environments));
          process.exit(1);
        }
        throw err;
      }

      if (result.requested && result.requested.length > 0) {
        success(
          `Filed ${result.requested.length} change request(s) for ${chalk.bold(environment)}.`
        );
        console.log();
        table(formatRequestedRows(result.requested), [
          { key: "key", header: "KEY" },
          { key: "requestId", header: "REQUEST ID" },
        ]);
        console.log();
        info("Waiting for a second person to approve.");
        return;
      }

      success(
        `Pushed ${result?.total || Object.keys(valid).length} variables to ${chalk.bold(environment)}`
      );
      console.log();
      console.log(chalk.dim(`  Created: ${result?.created || 0}`));
      console.log(chalk.dim(`  Updated: ${result?.updated || 0}`));
      if (mode === "replace") {
        console.log(chalk.dim(`  Deleted: ${result?.deleted || 0}`));
      }

      // Surface keys the server refused for authorization/scope reasons. These
      // were NOT written — report them plainly instead of counting as success.
      const deniedKeys = result?.deniedKeys ?? [];
      if (deniedKeys.length > 0) {
        console.log();
        warning(
          `${deniedKeys.length} variable(s) were NOT written (access denied):`
        );
        for (const key of deniedKeys) {
          console.log(chalk.red(`  ✗ ${key}`));
        }
      }
      if (result?.skipped && result.skipped > 0) {
        console.log(chalk.dim(`  Skipped: ${result.skipped}`));
      }
    } catch (err) {
      await handleError(err);
    }
  });
