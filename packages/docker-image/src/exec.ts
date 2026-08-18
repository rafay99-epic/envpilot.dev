import { spawn } from "node:child_process";
import type { EnvpilotVariable } from "./api.js";

/** Signals forwarded to the child so `docker stop` reaches the real app. */
const FORWARDED: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

/**
 * Run `command` with the pulled variables merged into its environment, and
 * resolve with the exit code to use.
 *
 * Variables are passed straight to the child process — nothing decrypted is
 * ever written to a filesystem on this path. Existing environment entries are
 * overwritten, because a value set in the Dockerfile is a default and the one
 * in Envpilot is the source of truth.
 *
 * The child's exit code becomes this process's exit code, and a child killed
 * by a signal reports 128 + signal the way a shell does, so health checks and
 * `docker wait` see what they would have seen without the wrapper.
 */
export function execWithVariables(
  command: string[],
  variables: EnvpilotVariable[]
): Promise<number> {
  const [bin, ...args] = command;
  const env = { ...process.env };
  for (const { key, value } of variables) env[key] = value;

  const child = spawn(bin!, args, { stdio: "inherit", env });

  const forward = (signal: NodeJS.Signals) => () => {
    if (!child.killed) child.kill(signal);
  };
  const handlers = FORWARDED.map(
    (signal) => [signal, forward(signal)] as const
  );
  for (const [signal, handler] of handlers) process.on(signal, handler);

  return new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("error", (error) => {
      rejectPromise(
        new Error(`could not run ${bin} — ${error.message}`, { cause: error })
      );
    });
    child.on("exit", (code, signal) => {
      resolvePromise(signal ? 128 + osSignalNumber(signal) : (code ?? 0));
    });
  }).finally(() => {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
  });
}

/** Signal name to number, for the shell's 128+N exit convention. */
function osSignalNumber(signal: NodeJS.Signals): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGKILL: 9,
    SIGTERM: 15,
  };
  return numbers[signal] ?? 0;
}
