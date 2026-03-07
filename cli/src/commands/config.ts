import { Command } from "commander";
import chalk from "chalk";
import { success, error, info, keyValue, header } from "../lib/ui.js";
import {
  getConfig,
  setConfig,
  clearConfig,
  getConfigPath,
  getApiUrl,
  setApiUrl,
  getUser,
  isAuthenticated,
} from "../lib/config.js";
import {
  readProjectConfig,
  getProjectConfigPath,
} from "../lib/project-config.js";

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
      error(err instanceof Error ? err.message : "Config operation failed");
      process.exit(1);
    }
  });

async function handleGet(key: string | undefined) {
  if (!key) {
    error("Missing key. Usage: env-connect config get <key>");
    console.log();
    console.log("Available keys:");
    console.log("  apiUrl              API endpoint URL");
    console.log("  user                Current authenticated user");
    console.log("  activeProjectId     Currently active project");
    console.log("  activeOrganizationId Currently active organization");
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

    default:
      error(`Unknown key: ${key}`);
      process.exit(1);
  }
}

async function handleSet(key: string | undefined, value: string | undefined) {
  if (!key || value === undefined) {
    error("Missing key or value. Usage: env-connect config set <key> <value>");
    console.log();
    console.log("Settable keys:");
    console.log("  apiUrl    API endpoint URL");
    process.exit(1);
  }

  switch (key) {
    case "apiUrl":
      // Validate URL
      try {
        new URL(value);
      } catch {
        error("Invalid URL format");
        process.exit(1);
      }
      setApiUrl(value);
      success(`Set apiUrl to ${value}`);
      break;

    default:
      error(`Cannot set key: ${key}`);
      console.log();
      console.log("Settable keys:");
      console.log("  apiUrl    API endpoint URL");
      process.exit(1);
  }
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
    header("Project Configuration (.envconnect)");
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
