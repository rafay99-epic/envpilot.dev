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
  setActiveOrganizationId,
  setActiveProjectId,
  setRole,
} from "../lib/config.js";
import {
  hasProjectConfig,
  writeProjectConfig,
  ensureEnvInGitignore,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import { notAuthenticated, handleError } from "../lib/errors.js";
import type { Organization, Project, Environment } from "../types/index.js";

export const initCommand = new Command("init")
  .description("Initialize Envpilot in the current directory")
  .option("-o, --organization <id>", "Organization ID")
  .option("-p, --project <id>", "Project ID")
  .option(
    "-e, --environment <env>",
    "Default environment (development, staging, production)"
  )
  .option("-f, --force", "Overwrite existing configuration")
  .action(async (options) => {
    try {
      // Check authentication
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // Check if already initialized
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
          (o) =>
            o._id === options.organization || o.slug === options.organization
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
          !["development", "staging", "production"].includes(
            options.environment
          )
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

      // Write configuration
      writeProjectConfig({
        projectId: selectedProject._id,
        organizationId: selectedOrg._id,
        environment: selectedEnvironment,
      });

      // Update global config
      setActiveOrganizationId(selectedOrg._id);
      setActiveProjectId(selectedProject._id);
      if (selectedOrg.role) {
        setRole(selectedOrg.role);
      }

      // Ensure .env is in .gitignore
      ensureEnvInGitignore();

      // Warn if .env files are already tracked by git
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

      console.log();
      success("Project initialized!");
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
    } catch (err) {
      await handleError(err);
    }
  });
