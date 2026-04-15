import chalk from "chalk";
import { executeCommand } from "./execute-command.js";

export async function openTUI(): Promise<void> {
  const [{ render }, { CLIApp }] = await Promise.all([
    import("ink"),
    import("./app.js"),
  ]);

  // The TUI runs in a loop: render → pick command → execute → repeat.
  // The loop exits only when the user presses Escape.
  while (true) {
    let selectedArgv: string[] | null = null;

    const app = render(
      <CLIApp
        onSelectCommand={(argv: string[]) => {
          selectedArgv = argv;
        }}
      />
    );

    await app.waitUntilExit();

    // User pressed Escape (no command selected) — exit the TUI.
    if (!selectedArgv) {
      break;
    }

    // Run the selected command with a clean terminal.
    const code = await executeCommand(selectedArgv);

    if (code !== 0) {
      process.exitCode = code;
    }

    // Let the user read the command output before the TUI re-renders.
    console.log();
    console.log(
      chalk.dim("  Press any key to return to the TUI…  (q to quit)")
    );

    // Wait for a single keypress.
    const quit = await new Promise<boolean>((resolve) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      process.stdin.once("data", (data: Buffer) => {
        const ch = data.toString();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        resolve(ch === "q" || ch === "Q");
      });
    });

    if (quit) {
      break;
    }
  }
}
