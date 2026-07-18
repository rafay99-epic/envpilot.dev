import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizePath, pathKey, pathsEqual, isPathInside } from "./paths";

const caseInsensitive =
  process.platform === "darwin" || process.platform === "win32";

describe("normalizePath", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "envpilot-paths-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves a symlinked path to the same key as the real path", () => {
    const realDir = path.join(tmpDir, "real");
    fs.mkdirSync(realDir);
    const realFile = path.join(realDir, ".env.local");
    fs.writeFileSync(realFile, "A=1");
    const linkDir = path.join(tmpDir, "link");
    fs.symlinkSync(realDir, linkDir);

    expect(normalizePath(path.join(linkDir, ".env.local"))).toBe(
      normalizePath(realFile)
    );
    expect(pathsEqual(path.join(linkDir, ".env.local"), realFile)).toBe(true);
  });

  it("falls back to lexical resolution when the file does not exist", () => {
    const missing = path.join(tmpDir, "nope", "..", "gone.env");
    const normalized = normalizePath(missing);

    expect(normalized).not.toContain("\\");
    expect(normalized).not.toContain("..");
    expect(normalized.endsWith("gone.env")).toBe(true);
  });

  it("normalizePath preserves case; pathKey folds it on case-insensitive platforms", () => {
    const mixed = path.join(tmpDir, "Mixed", "Case.ENV");

    // Storage/IO identity never case-folds — the result is used as an fs path.
    expect(normalizePath(mixed).endsWith("Mixed/Case.ENV")).toBe(true);

    if (caseInsensitive) {
      expect(pathKey(mixed)).toBe(pathKey(mixed.toLowerCase()));
      expect(pathsEqual(mixed, mixed.toLowerCase())).toBe(true);
    } else {
      expect(pathKey(mixed).endsWith("Mixed/Case.ENV")).toBe(true);
    }
  });

  it("isPathInside: containment, self, and sibling-prefix bypass", () => {
    const parent = path.join(tmpDir, "repo");
    expect(isPathInside(path.join(parent, "apps", "web"), parent)).toBe(true);
    expect(isPathInside(parent, parent)).toBe(true);
    // Sibling whose name shares a prefix must NOT count as inside.
    expect(isPathInside(path.join(tmpDir, "repo-two"), parent)).toBe(false);
    expect(isPathInside(tmpDir, parent)).toBe(false);
  });

  it("treats two casings of an existing file as the same key on case-insensitive platforms", () => {
    const filePath = path.join(tmpDir, "CaseFile.env");
    fs.writeFileSync(filePath, "A=1");

    if (caseInsensitive) {
      expect(pathsEqual(filePath, filePath.toUpperCase())).toBe(true);
    } else {
      expect(pathsEqual(filePath, filePath)).toBe(true);
    }
  });
});
