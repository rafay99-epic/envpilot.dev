import { Command } from "commander";
import { CLI_VERSION } from "./cli-version.js";
import { getCommandCatalog } from "./command-catalog.js";
import { enforceVersion } from "./version-check.js";
import { setCommandContext } from "./sentry.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("envpilot")
    .description("Envpilot CLI - Sync, secure, and share environment variables")
    .version(CLI_VERSION)
    // Required so subcommands (like `run`) can use passThroughOptions()
    // to forward args/flags to a spawned child process after `--`.
    .enablePositionalOptions();

  for (const command of getCommandCatalog()) {
    if (!command.topLevel) continue;
    if (command.createCommand) {
      program.addCommand(command.createCommand());
    }
  }

  // Enforce the version policy BEFORE any command runs (parseAsync awaits this).
  // Below the server's minimum supported version → hard-block and exit, since
  // the command would otherwise call server/Convex contracts that no longer
  // exist. Merely-outdated just prints a soft update notice and proceeds.
  // `--version`/`--help` short-circuit Commander before actions, so they are
  // naturally exempt (users can always check their version / read help).
  program.hook("preAction", async (_command, actionCommand) => {
    setCommandContext(actionCommand.name());
    const blocked = await enforceVersion();
    if (blocked) process.exit(1);
  });

  return program;
}
