import { Command } from "commander";
import { openTUI, isInteractiveTerminal } from "../ui/render-tui.js";

export function createUICommand(): Command {
  return new Command("ui")
    .alias("dashboard")
    .description("Open the interactive Ink-powered terminal UI")
    .action(async () => {
      // When spawned as a TUI child (e.g. user selected "envpilot ui" from
      // inside the TUI), skip opening a nested TUI — just exit cleanly.
      if (process.env.ENVPILOT_TUI_CHILD === "1") {
        return;
      }

      // Ink's raw-mode input needs a real TTY on both ends; piped/CI stdin
      // crashes with "Raw mode is not supported on the current
      // process.stdin" as soon as the TUI tries to render.
      if (!isInteractiveTerminal()) {
        console.error(
          "The interactive dashboard requires an interactive terminal (TTY). Run `envpilot --help` for command usage."
        );
        process.exit(1);
      }

      await openTUI();
    });
}
