import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withConfigLock, withConfigLockSync } from "../src/lib/config-lock.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function configPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "envpilot-config-lock-"));
  const path = join(dir, "config.json");
  dirs.push(dir);
  writeFileSync(path, "{}");
  return path;
}

describe("config lock", () => {
  it("rejects a sync lock nested inside an async lock", async () => {
    const path = configPath();

    await expect(
      withConfigLock(path, () => withConfigLockSync(path, () => undefined))
    ).rejects.toThrow("Config lock cannot be acquired recursively.");
  });

  it("rejects a nested sync lock", () => {
    const path = configPath();

    expect(() =>
      withConfigLockSync(path, () => withConfigLockSync(path, () => undefined))
    ).toThrow("Config lock cannot be acquired recursively.");
  });
});
