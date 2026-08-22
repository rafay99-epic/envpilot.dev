import { executeCommand } from "./execute-command.js";

// Ink's raw-mode input requires a real interactive terminal on both ends.
// Piped/CI/non-TTY stdin or stdout throws "Raw mode is not supported on the
// current process.stdin" as soon as the TUI tries to render, so callers must
// gate on this before ever invoking openTUI().
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

export async function openTUI(): Promise<void> {
  const [{ render }, { CLIApp }, { PressAnyKey }] = await Promise.all([
    import("ink"),
    import("./app.js"),
    import("./press-any-key.js"),
  ]);

  const runCycle = async (): Promise<boolean> => {
    let selectedArgv: string[] | null = null;

    const app = render(
      <CLIApp
        onSelectCommand={(argv: string[]) => {
          selectedArgv = argv;
        }}
      />
    );

    await app.waitUntilExit();

    if (!selectedArgv) {
      return false;
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

    return !quit;
  };

  await new Promise<void>((resolve, reject) => {
    const runNext = (): void => {
      void runCycle().then((continueRunning) => {
        if (continueRunning) {
          runNext();
        } else {
          resolve();
        }
      }, reject);
    };

    runNext();
  });
}
