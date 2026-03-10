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
import { isAuthenticated, getRole } from "../lib/config.js";
import {
  readProjectConfig,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import {
  readEnvFile,
  writeEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
} from "../lib/env-file.js";
import { notAuthenticated, notInitialized } from "../lib/errors.js";
import type { Variable } from "../types/index.js";

export const pullCommand = new Command("pull")
  .description("Download environment variables to local .env file")
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)"
  )
  .option("-f, --file <path>", "Output file path (default: .env)")
  .option("--force", "Overwrite without confirmation")
  .option("--format <format>", "Output format: env, json", "env")
  .option("--dry-run", "Show what would be downloaded without writing")
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

      const environment =
        options.env || projectConfig.environment || "development";
      const outputPath = options.file || getEnvPathForEnvironment(environment);

      const api = createAPIClient();

      // Fetch variables
      const variables = await withSpinner(
        `Fetching ${chalk.bold(environment)} variables...`,
        async () => {
          const response = await api.get<{
            success: boolean;
            data: Variable[];
            meta: { total: number; environment: string };
          }>("/api/cli/variables", {
            projectId: projectConfig.projectId,
            environment,
          });
          return response.data || [];
        }
      );

      if (variables.length === 0) {
        warning(`No variables found for ${environment} environment.`);
        return;
      }

      // Convert to key-value object
      const remoteVars: Record<string, string> = {};
      for (const variable of variables) {
        remoteVars[variable.key] = variable.value;
      }

      // Read existing local file
      const localVars = readEnvFile(outputPath) || {};

      // Calculate diff
      const diffResult = diffEnvVars(remoteVars, localVars);
      const hasChanges =
        Object.keys(diffResult.added).length > 0 ||
        Object.keys(diffResult.removed).length > 0 ||
        Object.keys(diffResult.changed).length > 0;

      if (!hasChanges) {
        success("Local file is up to date.");
        return;
      }

      // Show diff
      console.log();
      console.log(chalk.bold("Changes:"));
      console.log();
      showDiff(diffResult.added, diffResult.removed, diffResult.changed);
      console.log();

      // Dry run
      if (options.dryRun) {
        info("Dry run - no changes written.");
        return;
      }

      // Confirm unless --force
      if (!options.force && Object.keys(localVars).length > 0) {
        const { proceed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "proceed",
            message: `Overwrite ${outputPath}?`,
            default: true,
          },
        ]);

        if (!proceed) {
          info("Pull cancelled.");
          return;
        }
      }

      // Write file based on format
      if (options.format === "json") {
        const fs = await import("node:fs");
        fs.writeFileSync(
          outputPath,
          JSON.stringify(remoteVars, null, 2) + "\n"
        );
      } else {
        // Build comments from variable descriptions
        const comments: Record<string, string> = {};
        for (const variable of variables) {
          if (variable.description) {
            comments[variable.key] = variable.description;
          }
        }

        writeEnvFile(outputPath, remoteVars, { sort: true, comments });
      }

      success(
        `Downloaded ${variables.length} variables to ${chalk.bold(outputPath)}`
      );

      if (getRole() === "member") {
        info(
          "As a Member, you may only see variables you have been granted access to."
        );
      }

      // Show summary
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
    } catch (err) {
      error(err instanceof Error ? err.message : "Pull failed");
      process.exit(1);
    }
  });
