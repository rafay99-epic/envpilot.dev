import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export async function executeCommand(argv: string[]): Promise<number> {
  const scriptPath = fileURLToPath(import.meta.url).replace(
    /\/ui\/execute-command\.[^/]+$/,
    "/index.js"
  );

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
