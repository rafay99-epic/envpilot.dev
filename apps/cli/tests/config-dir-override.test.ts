import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ENVPILOT_CONFIG_DIR exists so a sandboxed or CI build can hold its own
 * login without the caller overriding $HOME. That distinction is the whole
 * point: $HOME is inherited by every child process, so isolating it sent
 * `envpilot run -- convex dev` looking for ~/.convex in an empty directory.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
  vi.resetModules();
  delete process.env.ENVPILOT_CONFIG_DIR;
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "envpilot-cfgtest-"));
  dirs.push(dir);
  return dir;
}

describe("ENVPILOT_CONFIG_DIR", () => {
  it("puts the config inside the directory it names", async () => {
    const dir = scratch();
    process.env.ENVPILOT_CONFIG_DIR = dir;
    vi.resetModules();
    const { getConfigPath } = await import("../src/lib/config.js");
    expect(getConfigPath()).toBe(join(dir, "config.json"));
  });

  it("keeps the run cache beside it, so secrets follow the config", async () => {
    const dir = scratch();
    process.env.ENVPILOT_CONFIG_DIR = dir;
    vi.resetModules();
    const { getCacheStats } = await import("../src/lib/variables-cache.js");
    expect(getCacheStats().dir).toBe(join(dir, "run-cache"));
  });

  it("falls back to the platform location when unset", async () => {
    delete process.env.ENVPILOT_CONFIG_DIR;
    vi.resetModules();
    const { getConfigPath } = await import("../src/lib/config.js");
    const path = getConfigPath();
    expect(path).toContain("envpilot");
    expect(path.endsWith("config.json")).toBe(true);
  });
});
