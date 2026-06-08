import { executeCommand } from "./execute-command.js";

export async function openTUI(): Promise<void> {
  const [{ render }, { CLIApp }, { PressAnyKey }] = await Promise.all([
    import("ink"),
    import("./app.js"),
    import("./press-any-key.js"),
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

    // Let the user read the command output, then wait for a keypress.
    // Rendered through Ink (not raw process.stdin) so the stdin lifecycle
    // stays consistent after the child process inherited the terminal.
    let quit = false;
    const prompt = render(
      <PressAnyKey
        onResolve={(q) => {
          quit = q;
        }}
      />
    );

    await prompt.waitUntilExit();

    if (quit) {
      break;
    }
  }
}
