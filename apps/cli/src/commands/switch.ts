import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  success,
  error,
  withSpinner,
  formatRole,
  roleNotice,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import {
  isAuthenticated,
  setActiveOrganizationId,
  setActiveProjectId,
  setRole,
} from "../lib/config.js";
import {
  readProjectConfig,
  writeProjectConfig,
  updateProjectConfig,
} from "../lib/project-config.js";
import { notAuthenticated } from "../lib/errors.js";
import type { Organization, Project, Environment } from "../types/index.js";

export const switchCommand = new Command("switch")
  .description("Switch project or environment")
  .argument("[target]", "project slug or environment name")
  .option("-o, --organization <id>", "Switch organization")
  .option("-p, --project <id>", "Switch project")
  .option(
    "-e, --env <environment>",
    "Switch environment (development, staging, production)"
  )
  .action(async (target, options) => {
    try {
      // Check authentication
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const api = createAPIClient();
      const projectConfig = readProjectConfig();

      // Handle environment switch
      if (
        options.env ||
        (target && ["development", "staging", "production"].includes(target))
      ) {
        const environment = (options.env || target) as Environment;

        if (!projectConfig) {
          error("No project initialized. Run `envpilot init` first.");
          process.exit(1);
        }

        updateProjectConfig({ environment });
        success(`Switched to ${chalk.bold(environment)} environment`);
        return;
      }

      // Handle organization switch
      if (options.organization) {
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

        const org = organizations.find(
          (o) =>
            o._id === options.organization || o.slug === options.organization
        );

        if (!org) {
          error(`Organization not found: ${options.organization}`);
          process.exit(1);
        }

        setActiveOrganizationId(org._id);
        if (org.role) {
          setRole(org.role);
        }

        if (projectConfig) {
          // Update project config with new organization
          updateProjectConfig({ organizationId: org._id });
        }

        success(`Switched to organization: ${chalk.bold(org.name)}`);
        if (org.role) {
          console.log(chalk.dim(`  Role: ${formatRole(org.role)}`));
          roleNotice(org.role);
        }
        return;
      }

      // Handle project switch
      if (options.project || target) {
        const projectIdentifier = options.project || target;

        // Need to determine which organization to use
        let organizationId = projectConfig?.organizationId;

        if (!organizationId) {
          // Fetch organizations and let user select
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
            error("No organizations found.");
            process.exit(1);
          }

          if (organizations.length === 1) {
            organizationId = organizations[0]._id;
            if (organizations[0].role) {
              setRole(organizations[0].role);
            }
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
            organizationId = orgId;
            const selectedOrg = organizations.find((o) => o._id === orgId);
            if (selectedOrg?.role) {
              setRole(selectedOrg.role);
            }
          }
        }

        // Fetch projects
        const projects = await withSpinner("Fetching projects...", async () => {
          const response = await api.get<{ success: boolean; data: Project[] }>(
            "/api/cli/projects",
            { organizationId: organizationId! }
          );
          return response.data || [];
        });

        const project = projects.find(
          (p) => p._id === projectIdentifier || p.slug === projectIdentifier
        );

        if (!project) {
          error(`Project not found: ${projectIdentifier}`);
          console.log();
          console.log("Available projects:");
          for (const p of projects) {
            console.log(`  ${p.icon || "📦"} ${p.name} (${p.slug})`);
          }
          process.exit(1);
        }

        // Update config
        setActiveProjectId(project._id);
        setActiveOrganizationId(organizationId!);

        const environment = projectConfig?.environment || "development";

        writeProjectConfig({
          projectId: project._id,
          organizationId: organizationId!,
          environment,
        });

        success(`Switched to project: ${chalk.bold(project.name)}`);
        return;
      }

      // Interactive mode - no arguments provided
      if (
        !target &&
        !options.project &&
        !options.organization &&
        !options.env
      ) {
        const { switchType } = await inquirer.prompt([
          {
            type: "list",
            name: "switchType",
            message: "What would you like to switch?",
            choices: [
              { name: "Environment", value: "environment" },
              { name: "Project", value: "project" },
              { name: "Organization", value: "organization" },
            ],
          },
        ]);

        if (switchType === "environment") {
          if (!projectConfig) {
            error("No project initialized. Run `envpilot init` first.");
            process.exit(1);
          }

          const { environment } = await inquirer.prompt([
            {
              type: "list",
              name: "environment",
              message: "Select environment:",
              choices: [
                { name: "Development", value: "development" },
                { name: "Staging", value: "staging" },
                { name: "Production", value: "production" },
              ],
              default: projectConfig.environment,
            },
          ]);

          updateProjectConfig({ environment });
          success(`Switched to ${chalk.bold(environment)} environment`);
          return;
        }

        if (switchType === "organization" || switchType === "project") {
          // Fetch organizations
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
            error("No organizations found.");
            process.exit(1);
          }

          const { orgId } = await inquirer.prompt([
            {
              type: "list",
              name: "orgId",
              message: "Select an organization:",
              choices: organizations.map((org) => ({
                name: `${org.name} ${org.tier === "pro" ? chalk.green("(Pro)") : chalk.dim("(Free)")}`,
                value: org._id,
              })),
              default: projectConfig?.organizationId,
            },
          ]);

          if (switchType === "organization") {
            setActiveOrganizationId(orgId);
            const org = organizations.find((o) => o._id === orgId)!;
            if (org.role) {
              setRole(org.role);
            }
            success(`Switched to organization: ${chalk.bold(org.name)}`);
            if (org.role) {
              console.log(chalk.dim(`  Role: ${formatRole(org.role)}`));
              roleNotice(org.role);
            }
            return;
          }

          // Store role for selected org
          const selectedOrg = organizations.find((o) => o._id === orgId);
          if (selectedOrg?.role) {
            setRole(selectedOrg.role);
          }

          // Continue with project selection
          const projects = await withSpinner(
            "Fetching projects...",
            async () => {
              const response = await api.get<{
                success: boolean;
                data: Project[];
              }>("/api/cli/projects", { organizationId: orgId });
              return response.data || [];
            }
          );

          if (projects.length === 0) {
            error("No projects found in this organization.");
            process.exit(1);
          }

          const { projectId } = await inquirer.prompt([
            {
              type: "list",
              name: "projectId",
              message: "Select a project:",
              choices: projects.map((project) => ({
                name: `${project.icon || "📦"} ${project.name}`,
                value: project._id,
              })),
              default: projectConfig?.projectId,
            },
          ]);

          const project = projects.find((p) => p._id === projectId)!;
          const environment = projectConfig?.environment || "development";

          setActiveProjectId(projectId);
          setActiveOrganizationId(orgId);

          writeProjectConfig({
            projectId,
            organizationId: orgId,
            environment,
          });

          success(`Switched to project: ${chalk.bold(project.name)}`);
        }
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Switch failed");
      process.exit(1);
    }
  });
