import { Command } from "commander";
import { CLI_VERSION } from "./cli-version.js";
import { getTopLevelCommandCatalog } from "./command-catalog.js";
import { checkForUpdate } from "./version-check.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("envpilot")
    .description("Envpilot CLI - Sync, secure, and share environment variables")
    .version(CLI_VERSION)
    // Required so subcommands (like `run`) can use passThroughOptions()
    // to forward args/flags to a spawned child process after `--`.
    .enablePositionalOptions();

  for (const command of getTopLevelCommandCatalog()) {
    if (command.createCommand) {
      program.addCommand(command.createCommand());
    }
  }

  program.hook("postAction", () => {
    checkForUpdate();
  });

  return program;
}
