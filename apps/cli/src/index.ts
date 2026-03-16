#!/usr/bin/env node

import { initSentry } from "./lib/sentry.js";
initSentry();

import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { pullCommand } from "./commands/pull.js";
import { pushCommand } from "./commands/push.js";
import { switchCommand } from "./commands/switch.js";
import { listCommand } from "./commands/list.js";
import { configCommand } from "./commands/config.js";
import { logoutCommand } from "./commands/logout.js";
import { usageCommand } from "./commands/usage.js";
import { checkForUpdate } from "./lib/version-check.js";

const program = new Command();

program
  .name("envpilot")
  .description("Envpilot CLI - Sync, secure, and share environment variables")
  .version("1.3.1");

// Add all commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(initCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(switchCommand);
program.addCommand(listCommand);
program.addCommand(configCommand);
program.addCommand(usageCommand);

// Check for updates after each command (non-blocking)
program.hook("postAction", () => {
  checkForUpdate();
});

// Parse command line arguments
program.parse();
