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
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import {
  readProjectConfig,
  getCurrentEnvironment,
} from "../lib/project-config.js";
import {
  readEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
} from "../lib/env-file.js";
import { validateEnvVars } from "../lib/validators.js";
import {
  notAuthenticated,
  notInitialized,
  fileNotFound,
} from "../lib/errors.js";
import type { Variable } from "../types/index.js";

export const pushCommand = new Command("push")
  .description("Upload local .env file to cloud")
  .option(
    "-e, --env <environment>",
    "Target environment (development, staging, production)",
  )
  .option("-f, --file <path>", "Input file path (default: .env)")
  .option("--merge", "Merge with existing variables (default)")
  .option("--replace", "Replace all existing variables")
  .option("--dry-run", "Show what would be uploaded without making changes")
  .option("--force", "Skip confirmation")
  .action(async (options) => {
    try {
      // Check authentication
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // Check initialization
      const projectConfig = readProjectConfig();
      if (!projectConfig) {
        throw notInitialized();
      }

      const environment =
        options.env || projectConfig.environment || "development";
      const inputPath = options.file || getEnvPathForEnvironment(environment);
      const mode = options.replace ? "replace" : "merge";

      // Read local file
      const localVars = readEnvFile(inputPath);
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

      const api = createAPIClient();

      // Fetch current remote variables for comparison
      const remoteVariables = await withSpinner(
        "Fetching current variables...",
        async () => {
          const response = await api.get<{
            success: boolean;
            data: Variable[];
          }>("/api/cli/variables", {
            projectId: projectConfig.projectId,
            environment,
          });
          return response.data || [];
        },
      );

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

      // For merge mode, don't show removed as they won't be deleted
      const removedToShow = mode === "replace" ? diffResult.removed : {};
      showDiff(diffResult.added, removedToShow, diffResult.changed);

      if (mode === "merge" && Object.keys(diffResult.removed).length > 0) {
        console.log();
        console.log(
          chalk.dim(
            `Note: ${Object.keys(diffResult.removed).length} remote variables not in local file will be preserved (use --replace to remove them)`,
          ),
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
          `  Would update: ${Object.keys(diffResult.changed).length}`,
        );
        if (mode === "replace") {
          console.log(
            `  Would delete: ${Object.keys(diffResult.removed).length}`,
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
      const result = await withSpinner(
        `Pushing variables to ${chalk.bold(environment)}...`,
        async () => {
          const response = await api.post<{
            success: boolean;
            requested?: boolean;
            data: {
              created: number;
              updated: number;
              deleted: number;
              total: number;
              requested?: number;
              skipped?: number;
            };
          }>("/api/cli/variables/bulk", {
            projectId: projectConfig.projectId,
            environment,
            variables: Object.entries(valid).map(([key, value]) => ({
              key,
              value,
            })),
            mode,
          });
          return response.data;
        },
      );

      if (result?.requested && result.requested > 0) {
        success(
          `Submitted ${result.requested} variable request(s) for ${chalk.bold(environment)}`,
        );
      } else {
        success(
          `Pushed ${result?.total || Object.keys(valid).length} variables to ${chalk.bold(environment)}`,
        );
      }

      // Show summary
      console.log();
      console.log(chalk.dim(`  Created: ${result?.created || 0}`));
      console.log(chalk.dim(`  Updated: ${result?.updated || 0}`));
      if (result?.requested) {
        console.log(chalk.dim(`  Requested: ${result.requested}`));
      }
      if (mode === "replace") {
        console.log(chalk.dim(`  Deleted: ${result?.deleted || 0}`));
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Push failed");
      process.exit(1);
    }
  });
