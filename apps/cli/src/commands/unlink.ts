import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { success, error, info } from "../lib/ui.js";
import { isAuthenticated, setActiveProjectId } from "../lib/config.js";
import {
  readProjectConfigV2,
  writeProjectConfigV2,
  deleteProjectConfig,
  resolveProject,
  removeProjectFromConfig,
  getActiveProject,
} from "../lib/project-config.js";
import { notAuthenticated, handleError } from "../lib/errors.js";

export const unlinkCommand = new Command("unlink")
  .description("Remove a linked project from this directory")
  .argument("[project]", "Project name or ID to unlink")
  .option("--force", "Skip confirmation")
  .action(async (projectArg, options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const config = readProjectConfigV2();
      if (!config || config.projects.length === 0) {
        error("No projects linked. Run `envpilot init` first.");
        process.exit(1);
      }

      // Resolve which project to unlink
      let targetProject;

      if (projectArg) {
        targetProject = resolveProject(config, projectArg);
        if (!targetProject) {
          error(`Project not found: ${projectArg}`);
          console.log();
          console.log("Linked projects:");
          for (const p of config.projects) {
            console.log(
              `  ${p.projectName || p.projectId} (${p.organizationName || p.organizationId})`
            );
          }
          process.exit(1);
        }
      } else if (config.projects.length > 1) {
        // Interactive picker
        const { projectId } = await inquirer.prompt([
          {
            type: "list",
            name: "projectId",
            message: "Select a project to unlink:",
            choices: config.projects.map((p) => {
              const isActive = p.projectId === config.activeProjectId;
              return {
                name: `${p.projectName || p.projectId} (${p.organizationName || p.organizationId})${isActive ? chalk.green(" *active") : ""}`,
                value: p.projectId,
              };
            }),
          },
        ]);
        targetProject = config.projects.find(
          (p) => p.projectId === projectId
        )!;
      } else {
        targetProject = config.projects[0];
      }

      const displayName = targetProject.projectName || targetProject.projectId;

      // Confirm
      if (!options.force) {
        const { proceed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "proceed",
            message: `Unlink "${displayName}"? Your .env files won't be deleted.`,
            default: false,
          },
        ]);

        if (!proceed) {
          info("Unlink cancelled.");
          return;
        }
      }

      // Remove from config
      const updated = removeProjectFromConfig(config, targetProject.projectId);

      if (!updated) {
        // Last project — delete the config file entirely
        deleteProjectConfig();
        success(`Unlinked "${displayName}". No projects remaining.`);
        info("Run `envpilot init` to link a new project.");
      } else {
        writeProjectConfigV2(updated);

        // Update global active project if it changed
        const newActive = getActiveProject(updated);
        if (newActive) {
          setActiveProjectId(newActive.projectId);
        }

        success(`Unlinked "${displayName}".`);
        if (
          config.activeProjectId === targetProject.projectId &&
          newActive
        ) {
          info(
            `Active project switched to "${newActive.projectName || newActive.projectId}".`
          );
        }
        console.log(
          chalk.dim(
            `  ${updated.projects.length} project${updated.projects.length !== 1 ? "s" : ""} remaining`
          )
        );
      }
    } catch (err) {
      await handleError(err);
    }
  });
