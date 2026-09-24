import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

const workspace = vi.hoisted(() => ({
  workspaceFolders: new Array<{ uri: { fsPath: string } }>(),
}));

vi.mock("vscode", () => ({ workspace }));
vi.mock("../utils/outputChannel", () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  show: vi.fn(),
}));
vi.mock("../utils/config", () => ({ shouldAutoInstallHook: () => true }));

import { GitCommitGuardService, isGuardedEnvFile } from "./gitCommitGuard";

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "envpilot-guard-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  workspace.workspaceFolders = [{ uri: { fsPath: root } }];
  return root;
}

describe("isGuardedEnvFile", () => {
  it("matches secrets by basename and spares templates", () => {
    expect(isGuardedEnvFile("/repo/apps/web/.env.local")).toBe(true);
    expect(isGuardedEnvFile("/repo/.env")).toBe(true);
    expect(isGuardedEnvFile("/repo/.env.example")).toBe(false);
    expect(isGuardedEnvFile("/repo/.env.sample")).toBe(false);
    expect(isGuardedEnvFile("/repo/not.env")).toBe(false);
    expect(isGuardedEnvFile("/repo/.environment/config")).toBe(false);
  });
});

describe("installHooks", () => {
  beforeEach(() => {
    workspace.workspaceFolders = [];
  });

  it("installs once, only for repos holding a linked directory", async () => {
    const root = repo();
    const hook = path.join(root, ".git", "hooks", "pre-commit");

    expect(await new GitCommitGuardService(() => []).installHooks()).toBe(0);

    const guard = new GitCommitGuardService(() => [path.join(root, "app")]);
    expect(await guard.installHooks()).toBe(1);
    const first = readFileSync(hook, "utf-8");
    expect(await guard.installHooks()).toBe(1);
    expect(readFileSync(hook, "utf-8")).toBe(first);
    expect(first).toContain("--diff-filter=ACMR");

    expect(await guard.removeHooks()).toBe(1);
    expect(await guard.removeHooks()).toBe(0);
  });

  it("skips core.hooksPath, non-sh hooks, and unterminated blocks", async () => {
    const guard = (root: string) =>
      new GitCommitGuardService(() => [root]).installHooks();

    const husky = repo();
    execFileSync("git", ["config", "core.hooksPath", ".husky"], {
      cwd: husky,
    });
    expect(await guard(husky)).toBe(0);
    mkdirSync(path.join(husky, ".husky"));
    writeFileSync(
      path.join(husky, ".husky", "pre-commit"),
      "#!/bin/sh\n# ENVPILOT_GUARD_START\nexit 1\n# ENVPILOT_GUARD_END\n"
    );
    expect(await new GitCommitGuardService(() => []).removeHooks()).toBe(1);

    const node = repo();
    const hooks = path.join(node, ".git", "hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(path.join(hooks, "pre-commit"), "#!/usr/bin/env node\n");
    expect(await guard(node)).toBe(0);

    writeFileSync(
      path.join(hooks, "pre-commit"),
      "#!/bin/sh\n# ENVPILOT_GUARD_START\necho hi\n"
    );
    expect(await guard(node)).toBe(0);
  });

  it("puts the guard before a hook's top-level exit", async () => {
    const root = repo();
    const hook = path.join(root, ".git", "hooks", "pre-commit");
    mkdirSync(path.dirname(hook), { recursive: true });
    writeFileSync(hook, "#!/bin/sh\nnpm test\nexit 0\n");
    expect(await new GitCommitGuardService(() => [root]).installHooks()).toBe(
      1
    );
    const content = readFileSync(hook, "utf-8");
    expect(content.startsWith("#!/bin/sh\n# ENVPILOT_GUARD_START")).toBe(true);
    expect(content.indexOf("ENVPILOT_GUARD_END")).toBeLessThan(
      content.indexOf("exit 0")
    );
  });
});
