import { Command } from "commander";
import chalk from "chalk";
import type { CLICommandDefinition } from "../lib/command-catalog.js";
import {
  CLI_COMMAND_COUNT,
  findCommandDefinition,
  formatArgv,
} from "../lib/command-catalog.js";
import { line, blank } from "../lib/ui.js";

function printCommandManual(commandName?: string): void {
  const command = findCommandDefinition(commandName);

  if (!command) {
    console.log(chalk.red(`Unknown command reference: ${commandName}`));
    console.log();
    console.log("Run `envpilot man` to see all supported commands.");
    process.exit(1);
  }

  console.log(chalk.bold(formatArgv(command.argv)));
  if (command.args) {
    console.log(chalk.dim(command.args));
  }
  blank();
  console.log(command.description);
  blank();
  console.log(chalk.green("Examples"));
  for (const example of command.examples) {
    console.log(`  ${chalk.cyan(formatArgv(example))}`);
  }
  blank();
  console.log(chalk.green("Notes"));
  for (const note of command.notes) {
    console.log(`  - ${note}`);
  }
}

function printManualIndex(commands: CLICommandDefinition[]): void {
  console.log(chalk.bold("ENVPILOT(1)"));
  console.log("TypeScript CLI manual");
  blank();
  console.log(
    `Total supported top-level commands: ${chalk.green(String(CLI_COMMAND_COUNT))}`
  );
  blank();
  console.log(
    "The CLI is implemented in TypeScript, uses an Ink terminal UI, and keeps env files out of git with both `.gitignore` and an optional pre-commit guard."
  );
  blank();
  line();
  console.log(chalk.green("Commands"));
  for (const command of commands) {
    console.log(
      `  ${chalk.cyan(formatArgv(command.argv).padEnd(24))} ${chalk.dim(command.description)}`
    );
  }
  blank();
  line();
  console.log(chalk.green("Security"));
  console.log("  - `.env*` is ignored by the repository `.gitignore`.");
  console.log(
    "  - `envpilot init` and `envpilot sync` ensure env files are added to `.gitignore` locally."
  );
  console.log(
    "  - `envpilot push` hard-blocks if tracked `.env` files are detected in git."
  );
  console.log(
    "  - The CLI can install a pre-commit hook to stop staged env files from being committed."
  );
  blank();
  line();
  console.log(chalk.green("Usage"));
  console.log(
    "  - `envpilot` or `envpilot ui` opens the interactive terminal UI."
  );
  console.log(
    "  - `envpilot man <command>` shows details for a single command."
  );
}

export function createManCommand(commands: CLICommandDefinition[]): Command {
  return new Command("man")
    .description("Show the CLI manual page")
    .argument("[command]", "Optional command to show detailed manual for")
    .action((command) => {
      if (command) {
        printCommandManual(command);
        return;
      }

      printManualIndex(commands);
    });
}
