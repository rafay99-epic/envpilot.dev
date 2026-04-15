import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function executeCommand(argv: string[]): Promise<number> {
  // tsup bundles every source file into flat chunks inside `dist/`, so at
  // runtime this file and `index.js` live in the same directory.
  // Using path.resolve (not a regex) keeps the resolution cross-platform.
  const scriptPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "index.js"
  );

  // Release stdin from Ink's raw mode so the child process gets a clean
  // terminal.  Without this, interactive commands (spinners, browser-open,
  // prompts) hang because they inherit a stdin stuck in raw mode.
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();

  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...argv], {
      stdio: "inherit",
      env: {
        ...process.env,
        ENVPILOT_TUI_CHILD: "1",
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}
