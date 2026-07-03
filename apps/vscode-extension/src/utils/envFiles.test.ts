import { describe, it, expect } from "vitest";
import { envFileNameFor, envFileNamesFor } from "./envFiles";

describe("envFileNameFor", () => {
  it("maps development to .env.local", () => {
    expect(envFileNameFor("development")).toBe(".env.local");
  });

  it("maps staging to .env.staging", () => {
    expect(envFileNameFor("staging")).toBe(".env.staging");
  });

  it("maps production to .env.production", () => {
    expect(envFileNameFor("production")).toBe(".env.production");
  });

  it("maps a custom environment name to .env.<name>", () => {
    expect(envFileNameFor("qa")).toBe(".env.qa");
    expect(envFileNameFor("preview")).toBe(".env.preview");
  });
});

describe("envFileNamesFor", () => {
  it("single-env directory keeps the stored (custom) targetFile", () => {
    const map = envFileNamesFor({
      environments: ["development"],
      targetFile: ".env.custom",
    });
    expect(map.size).toBe(1);
    expect(map.get("development")).toBe(".env.custom");
  });

  it("single-env staging keeps its custom targetFile (no forced rename)", () => {
    const map = envFileNamesFor({
      environments: ["staging"],
      targetFile: ".env",
    });
    expect(map.get("staging")).toBe(".env");
  });

  it("multi-env directory ignores targetFile and derives per-env filenames", () => {
    const map = envFileNamesFor({
      environments: ["development", "staging", "production"],
      targetFile: ".env.local",
    });
    expect(map.size).toBe(3);
    expect(map.get("development")).toBe(".env.local");
    expect(map.get("staging")).toBe(".env.staging");
    expect(map.get("production")).toBe(".env.production");
  });

  it("multi-env ignores even a custom targetFile", () => {
    const map = envFileNamesFor({
      environments: ["staging", "production"],
      targetFile: ".env.whatever",
    });
    expect(Array.from(map.values())).toEqual([
      ".env.staging",
      ".env.production",
    ]);
    expect(Array.from(map.values())).not.toContain(".env.whatever");
  });
});
