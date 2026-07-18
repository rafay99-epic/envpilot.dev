import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizePath, pathsEqual } from "./paths";

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

  it("lowercases on case-insensitive platforms only", () => {
    const mixed = path.join(tmpDir, "Mixed", "Case.ENV");
    const normalized = normalizePath(mixed);

    if (caseInsensitive) {
      expect(normalized).toBe(normalized.toLowerCase());
      expect(pathsEqual(mixed, mixed.toLowerCase())).toBe(true);
    } else {
      expect(normalized.endsWith("Mixed/Case.ENV")).toBe(true);
    }
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
