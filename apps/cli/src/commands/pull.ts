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
  readProjectConfigV2,
  resolveProject,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import {
  readEnvFile,
  writeEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
  applyFileProtection,
} from "../lib/env-file.js";
import {
  serialize,
  getDefaultFilename,
  ALL_FORMATS,
  type FormatType,
} from "../lib/format-converter.js";
import { getRole } from "../lib/config.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
} from "../lib/errors.js";
import type { Variable, ProjectEntry } from "../types/index.js";

export const pullCommand = new Command("pull")
  .description("Download environment variables to local .env file")
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)"
  )
  .option("-f, --file <path>", "Output file path (default: .env)")
  .option("--force", "Overwrite without confirmation")
  .option(
    "--format <format>",
    "Output format: env, json, yaml, docker-compose, aws, vercel, netlify",
    "env"
  )
  .option(
    "--prefix <prefix>",
    "AWS Parameter Store path prefix (default: /project-name)"
  )
  .option("--dry-run", "Show what would be downloaded without writing")
  .option("--project <name-or-id>", "Pull a specific linked project")
  .option("--all", "Pull all linked projects")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // --all: pull every linked project
      if (options.all) {
        if (options.env || options.file) {
          error("Cannot use --env or --file with --all.");
          process.exit(1);
        }
        await pullAllProjects(options);
        return;
      }

      // --project: pull specific project
      if (options.project) {
        const configV2 = readProjectConfigV2();
        if (!configV2) throw notInitialized();

        const project = resolveProject(configV2, options.project);
        if (!project) {
          error(`Project not found: ${options.project}`);
          console.log();
          console.log("Linked projects:");
          for (const p of configV2.projects) {
            console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
          }
          process.exit(1);
        }

        await pullSingleProject(project, options);
        return;
      }

      // Default: pull active project (V1 compat path)
      const projectConfig = readProjectConfig();
      if (!projectConfig) throw notInitialized();

      // Check for .env files tracked by git
      checkTrackedFiles();

      const environment =
        options.env || projectConfig.environment || "development";
      const fmt = (options.format || "env") as FormatType;
      if (!ALL_FORMATS.includes(fmt)) {
        error(`Unknown format: ${fmt}. Supported: ${ALL_FORMATS.join(", ")}`);
        process.exit(1);
      }
      const outputPath =
        options.file ||
        (fmt === "env"
          ? getEnvPathForEnvironment(environment)
          : getDefaultFilename(fmt, environment));

      await pullProject(
        {
          projectId: projectConfig.projectId,
          organizationId: projectConfig.organizationId,
          environment,
        },
        outputPath,
        options
      );
    } catch (err) {
      await handleError(err);
    }
  });

async function pullAllProjects(options: {
  force?: boolean;
  format?: string;
  dryRun?: boolean;
}): Promise<void> {
  const configV2 = readProjectConfigV2();
  if (!configV2) throw notInitialized();

  checkTrackedFiles();

  let totalPulled = 0;
  let totalFailed = 0;

  for (const project of configV2.projects) {
    const outputPath = getEnvPathForEnvironment(project.environment);
    const displayName = project.projectName || project.projectId;

    console.log();
    console.log(
      chalk.bold(
        `Pulling "${displayName}" (${project.environment}) → ${outputPath}`
      )
    );

    try {
      await pullProject(
        {
          projectId: project.projectId,
          organizationId: project.organizationId,
          environment: project.environment,
        },
        outputPath,
        options
      );
      totalPulled++;
    } catch (err) {
      totalFailed++;
      if (err instanceof Error) {
        error(`  Failed: ${err.message}`);
      }
    }
  }

  console.log();
  if (totalFailed === 0) {
    success(`Pulled ${totalPulled} project${totalPulled !== 1 ? "s" : ""}`);
  } else {
    warning(
      `Pulled ${totalPulled}/${totalPulled + totalFailed} projects. ${totalFailed} failed.`
    );
  }
}

async function pullSingleProject(
  project: ProjectEntry,
  options: {
    env?: string;
    file?: string;
    force?: boolean;
    format?: string;
    prefix?: string;
    dryRun?: boolean;
  }
): Promise<void> {
  checkTrackedFiles();

  const environment = options.env || project.environment;
  const fmt = (options.format || "env") as FormatType;
  const outputPath =
    options.file ||
    (fmt === "env"
      ? getEnvPathForEnvironment(environment)
      : getDefaultFilename(fmt, environment));

  await pullProject(
    {
      projectId: project.projectId,
      organizationId: project.organizationId,
      environment,
    },
    outputPath,
    options
  );
}

async function pullProject(
  project: {
    projectId: string;
    organizationId: string;
    environment: string;
  },
  outputPath: string,
  options: {
    force?: boolean;
    format?: string;
    prefix?: string;
    dryRun?: boolean;
  }
): Promise<void> {
  const api = createAPIClient();

  let metaProjectRole: string | null | undefined;

  const variables = await withSpinner(
    `Fetching ${chalk.bold(project.environment)} variables...`,
    async () => {
      const response = await api.get<{
        success: boolean;
        data: Variable[];
        meta: {
          total: number;
          environment: string;
          role?: string;
          projectRole?: string | null;
        };
      }>("/api/cli/variables", {
        projectId: project.projectId,
        environment: project.environment,
        ...(project.organizationId && {
          organizationId: project.organizationId,
        }),
      });
      metaProjectRole = response.meta?.projectRole;
      return response.data || [];
    }
  );

  if (variables.length === 0) {
    warning(`No variables found for ${project.environment} environment.`);
    return;
  }

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
    success("Local file is up to date.");
    return;
  }

  console.log();
  console.log(chalk.bold("Changes:"));
  console.log();
  showDiff(diffResult.added, diffResult.removed, diffResult.changed);
  console.log();

  if (options.dryRun) {
    info("Dry run - no changes written.");
    return;
  }

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

  // Make file writable before writing (may be read-only from previous pull)
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(outputPath)) {
      fs.chmodSync(outputPath, 0o644);
    }
  } catch {
    // Ignore — file may not exist yet
  }

  const fmt = (options.format || "env") as FormatType;
  if (fmt === "env") {
    const comments: Record<string, string> = {};
    for (const variable of variables) {
      if (variable.description) {
        comments[variable.key] = variable.description;
      }
    }
    writeEnvFile(outputPath, remoteVars, { sort: true, comments });
  } else {
    const fs = await import("node:fs");
    const output = serialize(remoteVars, fmt, {
      projectName: project.projectId,
      environment: project.environment,
      prefix: options.prefix,
    });
    fs.writeFileSync(outputPath, output, "utf-8");
  }

  // Apply role-based file protection (matches extension behavior)
  const role = getRole();
  applyFileProtection(outputPath, role, metaProjectRole);

  success(
    `Downloaded ${variables.length} variables to ${chalk.bold(outputPath)}`
  );

  if (metaProjectRole === "viewer") {
    info(
      "You have Viewer access to this project. You may only see variables you have been explicitly granted access to."
    );
  }

  // Show protection status
  const isProtected =
    role !== "admin" && role !== "team_lead" && metaProjectRole !== "manager";
  if (isProtected) {
    info(
      `File is read-only (your role: ${role || metaProjectRole || "member"}).`
    );
  }

  console.log();
  console.log(chalk.dim(`  Added:   ${Object.keys(diffResult.added).length}`));
  console.log(
    chalk.dim(`  Changed: ${Object.keys(diffResult.changed).length}`)
  );
  console.log(
    chalk.dim(`  Removed: ${Object.keys(diffResult.removed).length}`)
  );
}

function checkTrackedFiles(): void {
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
}
