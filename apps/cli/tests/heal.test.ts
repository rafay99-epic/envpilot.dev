import { describe, it, expect, afterEach } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { startHeal, isHealSupported } from "../src/lib/secrets/heal.js";
import type { HealHandle } from "../src/lib/secrets/heal.js";

/**
 * The point of heal is that secrets survive a wrapper that scrubs the
 * environment. These tests reproduce that by spawning the child with an env
 * that contains NOTHING but PATH and the NODE_OPTIONS fragment, which is
 * strictly harsher than what Turborepo's strict mode leaves behind.
 *
 * The child MUST be spawned asynchronously. The pipe is served from this
 * process's event loop, so a synchronous spawn deadlocks: the parent cannot
 * write the payload while it is blocked waiting for the child to exit. That is
 * a property of the test harness, not of `run`, which spawns via cross-spawn.
 */

let handle: HealHandle | null = null;

afterEach(() => {
  handle?.close();
  handle = null;
});

const run = promisify(execFile);

/** Read a key from a child started with a deliberately scrubbed environment. */
async function readThroughScrubbedEnv(
  nodeOptions: string,
  key: string,
  extra: NodeJS.ProcessEnv = {}
): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    [
      "-e",
      `process.stdout.write(String(process.env[${JSON.stringify(key)}] ?? ""))`,
    ],
    {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_OPTIONS: nodeOptions,
        ...extra,
      },
      encoding: "utf-8",
      timeout: 15000,
    }
  );
  return stdout;
}

describe.runIf(isHealSupported())("startHeal", () => {
  it("delivers a secret the wrapper stripped", async () => {
    handle = startHeal(new Map([["WORKOS_COOKIE_PASSWORD", "cookie-pw"]]));
    expect(handle).not.toBeNull();
    await expect(
      readThroughScrubbedEnv(handle!.nodeOptions, "WORKOS_COOKIE_PASSWORD")
    ).resolves.toBe("cookie-pw");
  });

  it("serves more than one child, because a dev server spawns many", async () => {
    handle = startHeal(new Map([["A", "first"]]));
    for (let i = 0; i < 3; i++) {
      await expect(
        readThroughScrubbedEnv(handle!.nodeOptions, "A")
      ).resolves.toBe("first");
    }
  });

  it("never overwrites a value the caller set deliberately", async () => {
    handle = startHeal(new Map([["A", "from-vault"]]));
    await expect(
      readThroughScrubbedEnv(handle!.nodeOptions, "A", { A: "from-caller" })
    ).resolves.toBe("from-caller");
  });

  it("round-trips values that need dotenv quoting", async () => {
    const awkward = 'line1\nline2 "quoted" #hash \\slash\ttab';
    handle = startHeal(new Map([["TRICKY", awkward]]));
    await expect(
      readThroughScrubbedEnv(handle!.nodeOptions, "TRICKY")
    ).resolves.toBe(awkward);
  });

  it("writes no secret value to disk", () => {
    handle = startHeal(new Map([["LEAKY", "super-secret-value"]]));
    // The shim path is the only thing NODE_OPTIONS carries. Its contents must
    // hold a path and nothing else.
    const shimPath = handle!.nodeOptions
      .replace(/^--require\s+/, "")
      .replace(/^"|"$/g, "");
    const contents = execFileSync("cat", [shimPath], { encoding: "utf-8" });
    expect(contents).not.toContain("super-secret-value");
    expect(contents).not.toContain("LEAKY=");
  });

  it("lets the child boot even after the pipe is gone", async () => {
    const live = startHeal(new Map([["A", "value"]]));
    const nodeOptions = live!.nodeOptions;
    live!.close();
    // Fail open: no pipe, no secret, but the process must still start.
    await expect(readThroughScrubbedEnv(nodeOptions, "A")).resolves.toBe("");
  });
});
