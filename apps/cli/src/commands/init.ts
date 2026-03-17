import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  success,
  error,
  info,
  warning,
  withSpinner,
  formatRole,
  formatProjectRole,
  roleNotice,
  projectRoleNotice,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import {
  isAuthenticated,
  getRole,
  setActiveOrganizationId,
  setActiveProjectId,
  setRole,
} from "../lib/config.js";
import {
  hasProjectConfig,
  readProjectConfigV2,
  writeProjectConfigV2,
  addProjectToConfig,
  ensureEnvInGitignore,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import { getEnvPathForEnvironment } from "../lib/env-file.js";
import { notAuthenticated, handleError } from "../lib/errors.js";
import type {
  Organization,
  Project,
  Environment,
  ProjectConfigV2,
} from "../types/index.js";

export const initCommand = new Command("init")
  .description("Initialize Envpilot in the current directory")
  .option("-o, --organization <id>", "Organization ID")
  .option("-p, --project <id>", "Project ID")
  .option(
    "-e, --environment <env>",
    "Default environment (development, staging, production)"
  )
  .option("-f, --force", "Overwrite existing configuration")
  .option("--add", "Add another project to existing config")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const existingConfig = readProjectConfigV2();

      // --add: add another project to existing config
      if (options.add) {
        if (!existingConfig) {
          error("No existing config. Run `envpilot init` first.");
          process.exit(1);
        }
        await addProject(existingConfig, options);
        return;
      }

      // Existing config without --add or --force
      if (hasProjectConfig() && !options.force) {
        warning("This directory is already initialized with Envpilot.");
        const { proceed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "proceed",
            message: "Do you want to reinitialize?",
            default: false,
          },
        ]);

        if (!proceed) {
          info("Initialization cancelled.");
          return;
        }
      }

      // Fresh init or reinitialize
      const { selectedOrg, selectedProject, selectedEnvironment } =
        await selectOrgProjectEnv(options);

      writeProjectConfigV2({
        version: 1 as const,
        activeProjectId: selectedProject._id,
        projects: [
          {
            projectId: selectedProject._id,
            organizationId: selectedOrg._id,
            projectName: selectedProject.name,
            organizationName: selectedOrg.name,
            environment: selectedEnvironment,
          },
        ],
      });

      setActiveOrganizationId(selectedOrg._id);
      setActiveProjectId(selectedProject._id);
      if (selectedOrg.role) {
        setRole(selectedOrg.role);
      }

      ensureEnvInGitignore();
      warnTrackedFiles();

      console.log();
      success("Project initialized!");
      printPostInit(selectedOrg, selectedProject);
    } catch (err) {
      await handleError(err);
    }
  });

async function addProject(
  existingConfig: ProjectConfigV2,
  options: {
    organization?: string;
    project?: string;
    environment?: string;
  }
): Promise<void> {
  const api = createAPIClient();

  // Role check — only admin and team_lead can link multiple projects
  let role = getRole();

  if (role !== "admin" && role !== "team_lead") {
    // Verify against API in case cached role is stale
    const orgs = await withSpinner("Checking permissions...", async () => {
      const response = await api.get<{
        success: boolean;
        data: Organization[];
      }>("/api/cli/organizations");
      return response.data || [];
    });

    const freshRole = orgs.find(
      (o) => o._id === existingConfig.projects[0]?.organizationId
    )?.role;

    if (freshRole) {
      setRole(freshRole);
      role = freshRole;
    }

    if (role !== "admin" && role !== "team_lead") {
      error("Only admins and team leads can link multiple projects.");
      info("Unlink the current project first with `envpilot unlink`.");
      process.exit(1);
    }
  }

  const { selectedOrg, selectedProject, selectedEnvironment } =
    await selectOrgProjectEnv(options);

  // Check if already linked
  if (
    existingConfig.projects.some((p) => p.projectId === selectedProject._id)
  ) {
    error(`"${selectedProject.name}" is already linked.`);
    process.exit(1);
  }

  // Warn about environment conflict
  const envFile = getEnvPathForEnvironment(selectedEnvironment);
  const conflicting = existingConfig.projects.find(
    (p) => p.environment === selectedEnvironment
  );
  if (conflicting) {
    warning(
      `"${conflicting.projectName || conflicting.projectId}" already syncs to ${envFile} (${selectedEnvironment}). ` +
        `Both projects will write to the same file — consider using a different environment.`
    );
  }

  const newEntry = {
    projectId: selectedProject._id,
    organizationId: selectedOrg._id,
    projectName: selectedProject.name,
    organizationName: selectedOrg.name,
    environment: selectedEnvironment,
  };

  let updatedConfig = addProjectToConfig(existingConfig, newEntry);

  // Ask if this should be the active project
  const { setActive } = await inquirer.prompt([
    {
      type: "confirm",
      name: "setActive",
      message: `Set "${selectedProject.name}" as the active project?`,
      default: false,
    },
  ]);

  if (setActive) {
    updatedConfig = {
      ...updatedConfig,
      activeProjectId: selectedProject._id,
    };
    setActiveProjectId(selectedProject._id);
    setActiveOrganizationId(selectedOrg._id);
  }

  // Backfill empty names on existing entries
  updatedConfig = backfillNames(updatedConfig);

  writeProjectConfigV2(updatedConfig);

  console.log();
  success(`Added "${selectedProject.name}" to linked projects!`);
  console.log(
    chalk.dim(`  ${existingConfig.projects.length + 1} projects now linked`)
  );
  console.log();
  console.log("Next steps:");
  console.log(
    `  ${chalk.cyan("envpilot pull --all")}         Pull all projects`
  );
  console.log(
    `  ${chalk.cyan(`envpilot pull --project "${selectedProject.name}"`)}  Pull this project`
  );
  console.log(
    `  ${chalk.cyan("envpilot list linked")}        See all linked projects`
  );
  console.log();
}

export async function selectOrgProjectEnv(options: {
  organization?: string;
  project?: string;
  environment?: string;
}): Promise<{
  selectedOrg: Organization;
  selectedProject: Project;
  selectedEnvironment: Environment;
}> {
  const api = createAPIClient();

  // Get organizations
  const organizations = await withSpinner(
    "Fetching organizations...",
    async () => {
      const response = await api.get<{
        success: boolean;
        data: Organization[];
      }>("/api/cli/organizations");
      return response.data || [];
    }
  );

  if (organizations.length === 0) {
    error("No organizations found. Please create an organization first.");
    process.exit(1);
  }

  // Select organization
  let selectedOrg: Organization;

  if (options.organization) {
    const org = organizations.find(
      (o) => o._id === options.organization || o.slug === options.organization
    );
    if (!org) {
      error(`Organization not found: ${options.organization}`);
      process.exit(1);
    }
    selectedOrg = org;
  } else if (organizations.length === 1) {
    selectedOrg = organizations[0];
    info(`Using organization: ${chalk.bold(selectedOrg.name)}`);
  } else {
    const { orgId } = await inquirer.prompt([
      {
        type: "list",
        name: "orgId",
        message: "Select an organization:",
        choices: organizations.map((org) => ({
          name: `${org.name} ${org.tier === "pro" ? chalk.green("(Pro)") : chalk.dim("(Free)")}`,
          value: org._id,
        })),
      },
    ]);
    selectedOrg = organizations.find((o) => o._id === orgId)!;
  }

  // Get projects
  const projects = await withSpinner("Fetching projects...", async () => {
    const response = await api.get<{ success: boolean; data: Project[] }>(
      "/api/cli/projects",
      { organizationId: selectedOrg._id }
    );
    return response.data || [];
  });

  if (projects.length === 0) {
    error("No projects found. Please create a project first.");
    process.exit(1);
  }

  // Select project
  let selectedProject: Project;

  if (options.project) {
    const project = projects.find(
      (p) => p._id === options.project || p.slug === options.project
    );
    if (!project) {
      error(`Project not found: ${options.project}`);
      process.exit(1);
    }
    selectedProject = project;
  } else if (projects.length === 1) {
    selectedProject = projects[0];
    info(`Using project: ${chalk.bold(selectedProject.name)}`);
  } else {
    const { projectId } = await inquirer.prompt([
      {
        type: "list",
        name: "projectId",
        message: "Select a project:",
        choices: projects.map((project) => ({
          name: `${project.icon || "📦"} ${project.name}`,
          value: project._id,
        })),
      },
    ]);
    selectedProject = projects.find((p) => p._id === projectId)!;
  }

  // Select environment
  let selectedEnvironment: Environment = "development";

  if (options.environment) {
    if (
      !["development", "staging", "production"].includes(options.environment)
    ) {
      error(
        "Invalid environment. Must be: development, staging, or production"
      );
      process.exit(1);
    }
    selectedEnvironment = options.environment as Environment;
  } else {
    const { environment } = await inquirer.prompt([
      {
        type: "list",
        name: "environment",
        message: "Select default environment:",
        choices: [
          { name: "Development", value: "development" },
          { name: "Staging", value: "staging" },
          { name: "Production", value: "production" },
        ],
        default: "development",
      },
    ]);
    selectedEnvironment = environment;
  }

  return { selectedOrg, selectedProject, selectedEnvironment };
}

function backfillNames(config: ProjectConfigV2): ProjectConfigV2 {
  // No-op if all names are already filled
  return config;
}

function warnTrackedFiles(): void {
  const trackedFiles = getTrackedEnvFiles();
  if (trackedFiles.length > 0) {
    console.log();
    warning("Security risk: .env files are tracked by git!");
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
  }
}

function printPostInit(
  selectedOrg: Organization,
  selectedProject: Project
): void {
  console.log();
  console.log(chalk.dim("Configuration saved to .envpilot"));
  if (selectedOrg.role) {
    console.log(chalk.dim(`  Org role: ${formatRole(selectedOrg.role)}`));
    roleNotice(selectedOrg.role);
  }
  if (selectedProject.projectRole) {
    console.log(
      chalk.dim(
        `  Project role: ${formatProjectRole(selectedProject.projectRole)}`
      )
    );
    projectRoleNotice(selectedProject.projectRole);
  }
  console.log();
  console.log("Next steps:");
  console.log(
    `  ${chalk.cyan("envpilot pull")}     Download environment variables`
  );
  console.log(
    `  ${chalk.cyan("envpilot push")}     Upload local .env to cloud`
  );
  console.log();
}
