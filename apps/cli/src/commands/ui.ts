import { Command } from "commander";
import { openTUI } from "../ui/render-tui.js";

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
      await openTUI();
    });
}
