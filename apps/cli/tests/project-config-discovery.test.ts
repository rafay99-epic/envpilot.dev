import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectConfigDir } from "../src/lib/project-config.js";

let root: string;

beforeEach(() => {
  // realpath because macOS /tmp is a symlink to /private/tmp, and the walk
  // returns resolved paths.
  root = realpathSync(mkdtempSync(join(tmpdir(), "envpilot-cfg-")));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findProjectConfigDir", () => {
  it("finds a config in the directory itself", () => {
    writeFileSync(join(root, ".envpilot"), "{}");
    expect(findProjectConfigDir(root)).toBe(root);
  });

  it("walks up to the monorepo root from a workspace directory", () => {
    // The case that used to fail: `cd apps/web && envpilot run`.
    writeFileSync(join(root, ".envpilot"), "{}");
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    expect(findProjectConfigDir(nested)).toBe(root);
  });

  it("prefers the nearest config when several exist", () => {
    writeFileSync(join(root, ".envpilot"), "{}");
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, ".envpilot"), "{}");
    expect(findProjectConfigDir(nested)).toBe(nested);
  });

  it("returns null rather than looping when nothing is found", () => {
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    expect(findProjectConfigDir(nested)).toBeNull();
  });
});

describe("findProjectConfigDir boundaries", () => {
  it("stops at the repository root instead of reaching the home directory", () => {
    // An unbounded walk finds ~/.envpilot, and one stray file there would
    // silently bind every project on the machine to a single link.
    mkdirSync(join(root, "repo"), { recursive: true });
    writeFileSync(join(root, ".envpilot"), "{}");
    writeFileSync(join(root, "repo", ".git"), "gitdir: elsewhere");
    const nested = join(root, "repo", "apps", "web");
    mkdirSync(nested, { recursive: true });
    expect(findProjectConfigDir(nested)).toBeNull();
  });

  it("still finds a config at the repository root itself", () => {
    const repo = join(root, "repo");
    mkdirSync(join(repo, "apps"), { recursive: true });
    writeFileSync(join(repo, ".git"), "gitdir: elsewhere");
    writeFileSync(join(repo, ".envpilot"), "{}");
    expect(findProjectConfigDir(join(repo, "apps"))).toBe(repo);
  });

  it("ignores a DIRECTORY named .envpilot", () => {
    // The VS Code extension stores session state in ~/.envpilot/, which an
    // existsSync check would happily match.
    mkdirSync(join(root, ".envpilot"), { recursive: true });
    const nested = join(root, "a");
    mkdirSync(nested, { recursive: true });
    expect(findProjectConfigDir(nested)).toBeNull();
  });
});
