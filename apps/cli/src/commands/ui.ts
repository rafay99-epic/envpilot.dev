import { Command } from "commander";
import { openTUI } from "../ui/render-tui.js";

export function createUICommand(): Command {
  return new Command("ui")
    .alias("dashboard")
    .description("Open the interactive Ink-powered terminal UI")
    .action(async () => {
      await openTUI();
    });
}
