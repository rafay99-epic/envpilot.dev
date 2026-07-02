import { describe, it, expect } from "vitest";
import {
  serialize,
  parse,
  getFileExtension,
  getContentType,
} from "../src/lib/format-converter.js";

const SAMPLE = {
  API_KEY: "secret123",
  DB_URL: "postgres://localhost:5432/db",
  DEBUG: "true",
};

describe("format-converter round-trips", () => {
  it("dotenv → json → dotenv preserves the variables", () => {
    const json = serialize(SAMPLE, "json");
    const parsedFromJson = parse(json, "json");
    expect(parsedFromJson).toEqual(SAMPLE);

    const env = serialize(parsedFromJson, "env");
    expect(parse(env, "env")).toEqual(SAMPLE);
  });

  it("json output is valid JSON", () => {
    const json = serialize(SAMPLE, "json");
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toEqual(SAMPLE);
  });

  it("yaml round-trips simple values", () => {
    const yaml = serialize(SAMPLE, "yaml");
    expect(parse(yaml, "yaml")).toEqual(SAMPLE);
  });

  it("vercel round-trips through the env wrapper", () => {
    const vercel = serialize(SAMPLE, "vercel");
    expect(JSON.parse(vercel)).toHaveProperty("env");
    expect(parse(vercel, "vercel")).toEqual(SAMPLE);
  });
});

describe("format-converter helpers", () => {
  it("returns expected file extensions", () => {
    expect(getFileExtension("json")).toBe(".json");
    expect(getFileExtension("netlify")).toBe(".toml");
    expect(getFileExtension("env")).toBe(".env");
  });

  it("returns expected content types", () => {
    expect(getContentType("json")).toBe("application/json");
    expect(getContentType("env")).toBe("text/plain");
  });
});

describe("netlify — [build.environment]", () => {
  it("round-trips through the build.environment table", () => {
    const toml = serialize(SAMPLE, "netlify");
    expect(toml).toContain("[build.environment]");
    expect(parse(toml, "netlify")).toEqual(SAMPLE);
  });

  it("unescapes quoted TOML values on parse", () => {
    const toml = '[build.environment]\n  KEY = "line1\\nline2"\n';
    expect(parse(toml, "netlify")).toEqual({ KEY: "line1\nline2" });
  });
});

// ── Audit-flagged edge case ─────────────────────────────────
// Netlify supports per-context env tables like [context.production.environment].
// Validates the format-converter audit fix for context environment parsing.
describe("netlify — [context.*.environment]", () => {
  it("parses variables under a context environment table", () => {
    const toml =
      "[context.production.environment]\n" +
      '  API_KEY = "secret123"\n' +
      '  DEBUG = "false"\n';
    expect(parse(toml, "netlify")).toEqual({
      API_KEY: "secret123",
      DEBUG: "false",
    });
  });
});
