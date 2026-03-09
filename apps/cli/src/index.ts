#!/usr/bin/env node

import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { pullCommand } from "./commands/pull.js";
import { pushCommand } from "./commands/push.js";
import { switchCommand } from "./commands/switch.js";
import { listCommand } from "./commands/list.js";
import { configCommand } from "./commands/config.js";
import { logoutCommand } from "./commands/logout.js";

const program = new Command();

program
  .name("envpilot")
  .description("Envpilot CLI - Sync, secure, and share environment variables")
  .version("0.1.0");

// Add all commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(initCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(switchCommand);
program.addCommand(listCommand);
program.addCommand(configCommand);

// Parse command line arguments
program.parse();
