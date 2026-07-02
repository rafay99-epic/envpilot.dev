import { Command } from "commander";
import chalk from "chalk";
import { success, error, info, keyValue, header } from "../lib/ui.js";
import {
  getConfig,
  clearConfig,
  getConfigPath,
  setApiUrl,
  normalizeApiUrl,
  isAuthenticated,
} from "../lib/config.js";
import {
  readProjectConfig,
  readProjectConfigV2,
  getActiveProject,
  updateProjectInConfig,
  writeProjectConfigV2,
  getProjectConfigPath,
} from "../lib/project-config.js";
import { handleError } from "../lib/errors.js";
import type { ProjectEntry } from "../types/index.js";

const FILE_PROTECTION_VALUES = ["auto", "always", "never"] as const;
const ENVIRONMENT_VALUES = ["development", "staging", "production"] as const;

/**
 * Apply an update to the active project's entry in the linked .envpilot config.
 * Throws with a clear message when no project is initialized in this directory.
 */
function updateActiveProjectEntry(updates: Partial<ProjectEntry>): void {
  const v2 = readProjectConfigV2();
  if (!v2) {
    error(
      "No project initialized in this directory. Run `envpilot init` first."
    );
    process.exit(1);
  }
  const active = getActiveProject(v2);
  if (!active) {
    error("No active project found in this directory.");
    process.exit(1);
  }
  writeProjectConfigV2(updateProjectInConfig(v2, active.projectId, updates));
}

export const configCommand = new Command("config")
  .description("Manage CLI configuration")
  .argument("[action]", "Action: get, set, list, path, reset")
  .argument("[key]", "Config key (for get/set)")
  .argument("[value]", "Config value (for set)")
  .action(async (action, key, value) => {
    try {
      switch (action) {
        case "get":
          await handleGet(key);
          break;

        case "set":
          await handleSet(key, value);
          break;

        case "list":
        case undefined:
          await handleList();
          break;

        case "path":
          await handlePath();
          break;

        case "reset":
          await handleReset();
          break;

        default:
          error(`Unknown action: ${action}`);
          console.log();
          console.log("Available actions:");
          console.log("  list          Show all configuration");
          console.log("  get <key>     Get a specific config value");
          console.log("  set <key> <value>  Set a config value");
          console.log("  path          Show config file locations");
          console.log("  reset         Reset all configuration");
          process.exit(1);
      }
    } catch (err) {
      await handleError(err);
    }
  });

async function handleGet(key: string | undefined) {
  if (!key) {
    error("Missing key. Usage: envpilot config get <key>");
    console.log();
    console.log("Available keys:");
    console.log("  apiUrl              API endpoint URL");
    console.log("  user                Current authenticated user");
    console.log("  activeProjectId     Currently active project");
    console.log("  activeOrganizationId Currently active organization");
    console.log(
      "  fileProtection      Active project .env protection (auto|always|never)"
    );
    console.log("  defaultEnvironment  Active project's default environment");
    process.exit(1);
  }

  const config = getConfig();

  switch (key) {
    case "apiUrl":
      console.log(config.apiUrl);
      break;

    case "user":
      if (config.user) {
        console.log(JSON.stringify(config.user, null, 2));
      } else {
        console.log(chalk.dim("(not set)"));
      }
      break;

    case "activeProjectId":
      console.log(config.activeProjectId || chalk.dim("(not set)"));
      break;

    case "activeOrganizationId":
      console.log(config.activeOrganizationId || chalk.dim("(not set)"));
      break;

    case "fileProtection": {
      const v2 = readProjectConfigV2();
      const active = v2 ? getActiveProject(v2) : null;
      console.log(active?.fileProtection ?? "auto");
      break;
    }

    case "defaultEnvironment": {
      const v2 = readProjectConfigV2();
      const active = v2 ? getActiveProject(v2) : null;
      console.log(active?.environment || chalk.dim("(not set)"));
      break;
    }

    default:
      error(`Unknown key: ${key}`);
      process.exit(1);
  }
}

async function handleSet(key: string | undefined, value: string | undefined) {
  if (!key || value === undefined) {
    error("Missing key or value. Usage: envpilot config set <key> <value>");
    console.log();
    printSettableKeys();
    process.exit(1);
  }

  switch (key) {
    case "apiUrl": {
      // Normalize first (adds https:// if missing, canonicalizes host),
      // then validate the result so bare domains like "envpilot.dev" work.
      const normalized = normalizeApiUrl(value);
      try {
        new URL(normalized);
      } catch {
        error("Invalid URL format");
        process.exit(1);
      }
      setApiUrl(value);
      success(`Set apiUrl to ${normalized}`);
      break;
    }

    case "fileProtection": {
      if (
        !FILE_PROTECTION_VALUES.includes(
          value as (typeof FILE_PROTECTION_VALUES)[number]
        )
      ) {
        error(
          `Invalid fileProtection value: ${value}. Expected one of: ${FILE_PROTECTION_VALUES.join(", ")}`
        );
        process.exit(1);
      }
      updateActiveProjectEntry({
        fileProtection: value as (typeof FILE_PROTECTION_VALUES)[number],
      });
      success(`Set fileProtection to ${value} for the active project`);
      break;
    }

    case "defaultEnvironment": {
      if (
        !ENVIRONMENT_VALUES.includes(
          value as (typeof ENVIRONMENT_VALUES)[number]
        )
      ) {
        error(
          `Invalid defaultEnvironment value: ${value}. Expected one of: ${ENVIRONMENT_VALUES.join(", ")}`
        );
        process.exit(1);
      }
      updateActiveProjectEntry({
        environment: value as (typeof ENVIRONMENT_VALUES)[number],
      });
      success(`Set defaultEnvironment to ${value} for the active project`);
      break;
    }

    default:
      error(`Cannot set key: ${key}`);
      console.log();
      printSettableKeys();
      process.exit(1);
  }
}

function printSettableKeys(): void {
  console.log("Settable keys:");
  console.log("  apiUrl              API endpoint URL");
  console.log(
    "  fileProtection      Active project .env protection (auto|always|never)"
  );
  console.log(
    "  defaultEnvironment  Active project default environment (development|staging|production)"
  );
}

async function handleList() {
  const config = getConfig();
  const projectConfig = readProjectConfig();

  header("Global Configuration");
  console.log();

  keyValue([
    ["API URL", config.apiUrl],
    ["Authenticated", isAuthenticated() ? chalk.green("Yes") : chalk.red("No")],
    ["User", config.user?.email],
    ["Active Organization", config.activeOrganizationId],
    ["Active Project", config.activeProjectId],
  ]);

  console.log();

  if (projectConfig) {
    header("Project Configuration (.envpilot)");
    console.log();

    keyValue([
      ["Project ID", projectConfig.projectId],
      ["Organization ID", projectConfig.organizationId],
      ["Environment", projectConfig.environment],
    ]);

    console.log();
  } else {
    info("No project configuration found in current directory.");
    console.log();
  }
}

async function handlePath() {
  header("Configuration Paths");
  console.log();

  keyValue([
    ["Global config", getConfigPath()],
    ["Project config", getProjectConfigPath()],
  ]);
}

async function handleReset() {
  const inquirer = await import("inquirer");

  const { confirm } = await inquirer.default.prompt([
    {
      type: "confirm",
      name: "confirm",
      message:
        "Are you sure you want to reset all configuration? This will log you out.",
      default: false,
    },
  ]);

  if (!confirm) {
    info("Reset cancelled.");
    return;
  }

  clearConfig();
  success("Configuration reset.");
}
