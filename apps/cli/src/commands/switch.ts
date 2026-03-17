import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  success,
  error,
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
  readProjectConfig,
  readProjectConfigV2,
  writeProjectConfigV2,
  writeProjectConfig,
  updateProjectConfig,
  setActiveProjectInConfig,
} from "../lib/project-config.js";
import { notAuthenticated, handleError } from "../lib/errors.js";
import type { Organization, Project, Environment } from "../types/index.js";

export const switchCommand = new Command("switch")
  .description("Switch project, environment, or active linked project")
  .argument("[target]", "project slug or environment name")
  .option("-o, --organization <id>", "Switch organization")
  .option("-p, --project <id>", "Switch project")
  .option(
    "-e, --env <environment>",
    "Switch environment (development, staging, production)"
  )
  .option("--active <name-or-id>", "Set a linked project as active")
  .action(async (target, options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const api = createAPIClient();
      const projectConfig = readProjectConfig();

      // Handle --active: switch active project among linked projects
      if (options.active) {
        const configV2 = readProjectConfigV2();
        if (!configV2 || configV2.projects.length < 2) {
          error(
            "No multiple projects linked. Use `envpilot init --add` to link another project."
          );
          process.exit(1);
        }

        const target = configV2.projects.find(
          (p) =>
            p.projectId === options.active ||
            p.projectName.toLowerCase() === options.active.toLowerCase()
        );

        if (!target) {
          error(`Project not found: ${options.active}`);
          console.log();
          console.log("Linked projects:");
          for (const p of configV2.projects) {
            const mark =
              p.projectId === configV2.activeProjectId
                ? chalk.green(" *")
                : "";
            console.log(
              `  ${p.projectName || p.projectId} (${p.environment})${mark}`
            );
          }
          process.exit(1);
        }

        const updated = setActiveProjectInConfig(configV2, target.projectId);
        writeProjectConfigV2(updated);
        setActiveProjectId(target.projectId);
        setActiveOrganizationId(target.organizationId);

        success(
          `Active project: ${chalk.bold(target.projectName || target.projectId)}`
        );
        return;
      }

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

        // Check if it's already a linked project
        const configV2 = readProjectConfigV2();
        if (configV2) {
          const linked = configV2.projects.find(
            (p) =>
              p.projectId === projectIdentifier ||
              p.projectName.toLowerCase() ===
                projectIdentifier.toLowerCase()
          );
          if (linked) {
            // Already linked — just set as active
            const updated = setActiveProjectInConfig(
              configV2,
              linked.projectId
            );
            writeProjectConfigV2(updated);
            setActiveProjectId(linked.projectId);
            setActiveOrganizationId(linked.organizationId);
            success(
              `Switched to project: ${chalk.bold(linked.projectName || linked.projectId)}`
            );
            return;
          }
        }

        // Not linked — fetch from API and replace active project entry
        let organizationId = projectConfig?.organizationId;

        if (!organizationId) {
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

        const projects = await withSpinner(
          "Fetching projects...",
          async () => {
            const response = await api.get<{
              success: boolean;
              data: Project[];
            }>("/api/cli/projects", { organizationId: organizationId! });
            return response.data || [];
          }
        );

        const project = projects.find(
          (p) =>
            p._id === projectIdentifier || p.slug === projectIdentifier
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

        setActiveProjectId(project._id);
        setActiveOrganizationId(organizationId!);

        const environment = projectConfig?.environment || "development";

        writeProjectConfig({
          projectId: project._id,
          organizationId: organizationId!,
          environment,
        });

        success(`Switched to project: ${chalk.bold(project.name)}`);
        if (project.projectRole) {
          console.log(
            chalk.dim(
              `  Project role: ${formatProjectRole(project.projectRole)}`
            )
          );
          projectRoleNotice(project.projectRole);
        }
        return;
      }

      // Interactive mode - no arguments provided
      if (
        !target &&
        !options.project &&
        !options.organization &&
        !options.env &&
        !options.active
      ) {
        const configV2 = readProjectConfigV2();
        const hasMultipleProjects =
          configV2 && configV2.projects.length > 1;

        const choices = [];
        if (hasMultipleProjects) {
          choices.push({
            name: "Active project",
            value: "active",
          });
        }
        choices.push(
          { name: "Environment", value: "environment" },
          { name: "Project", value: "project" },
          { name: "Organization", value: "organization" }
        );

        const { switchType } = await inquirer.prompt([
          {
            type: "list",
            name: "switchType",
            message: "What would you like to switch?",
            choices,
          },
        ]);

        if (switchType === "active" && configV2) {
          const { projectId } = await inquirer.prompt([
            {
              type: "list",
              name: "projectId",
              message: "Select active project:",
              choices: configV2.projects.map((p) => {
                const isActive =
                  p.projectId === configV2.activeProjectId;
                return {
                  name: `${p.projectName || p.projectId} (${p.environment})${isActive ? chalk.green(" *current") : ""}`,
                  value: p.projectId,
                };
              }),
              default: configV2.activeProjectId,
            },
          ]);

          const selected = configV2.projects.find(
            (p) => p.projectId === projectId
          )!;
          const updated = setActiveProjectInConfig(configV2, projectId);
          writeProjectConfigV2(updated);
          setActiveProjectId(projectId);
          setActiveOrganizationId(selected.organizationId);
          success(
            `Active project: ${chalk.bold(selected.projectName || selected.projectId)}`
          );
          return;
        }

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

          const selectedOrg = organizations.find((o) => o._id === orgId);
          if (selectedOrg?.role) {
            setRole(selectedOrg.role);
          }

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
          if (project.projectRole) {
            console.log(
              chalk.dim(
                `  Project role: ${formatProjectRole(project.projectRole)}`
              )
            );
            projectRoleNotice(project.projectRole);
          }
        }
      }
    } catch (err) {
      await handleError(err);
    }
  });
