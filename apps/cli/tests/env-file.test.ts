import { describe, it, expect } from "vitest";
import {
  parseEnvFile,
  stringifyEnv,
  isValidEnvKey,
} from "../src/lib/env-file.js";

describe("isValidEnvKey", () => {
  it("accepts keys starting with a letter or underscore", () => {
    expect(isValidEnvKey("KEY")).toBe(true);
    expect(isValidEnvKey("_KEY")).toBe(true);
    expect(isValidEnvKey("KEY_123")).toBe(true);
    expect(isValidEnvKey("lower_case")).toBe(true);
  });

  it("rejects keys with leading digits, dashes, spaces, or dots", () => {
    expect(isValidEnvKey("1KEY")).toBe(false);
    expect(isValidEnvKey("KEY-NAME")).toBe(false);
    expect(isValidEnvKey("KEY NAME")).toBe(false);
    expect(isValidEnvKey("KEY.NAME")).toBe(false);
    expect(isValidEnvKey("")).toBe(false);
  });
});

describe("parseEnvFile — stable behavior", () => {
  it("parses simple KEY=value pairs", () => {
    expect(parseEnvFile("A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });

  it("skips blank lines and comment lines", () => {
    expect(parseEnvFile("\n# a comment\nA=1\n\n#another\nB=2\n")).toEqual({
      A: "1",
      B: "2",
    });
  });

  it("keeps '=' characters that appear inside the value", () => {
    expect(parseEnvFile("URL=a=b=c")).toEqual({ URL: "a=b=c" });
    expect(parseEnvFile("JWT=eyJ.abc=")).toEqual({ JWT: "eyJ.abc=" });
  });

  it("strips surrounding double quotes and unescapes sequences", () => {
    expect(parseEnvFile('KEY="hello world"')).toEqual({ KEY: "hello world" });
    expect(parseEnvFile('KEY="line1\\nline2"')).toEqual({
      KEY: "line1\nline2",
    });
  });

  it("strips single quotes without escape processing", () => {
    expect(parseEnvFile("KEY='raw\\nvalue'")).toEqual({ KEY: "raw\\nvalue" });
  });

  it("drops entries whose key is invalid", () => {
    expect(parseEnvFile("1BAD=x\nGOOD=y")).toEqual({ GOOD: "y" });
  });
});

describe("stringifyEnv", () => {
  it("emits KEY=value lines terminated by a newline", () => {
    expect(stringifyEnv({ A: "1", B: "2" })).toBe("A=1\nB=2\n");
  });

  it("sorts keys when requested", () => {
    expect(stringifyEnv({ B: "2", A: "1" }, { sort: true })).toBe(
      "A=1\nB=2\n"
    );
  });

  it("quotes values containing spaces, hashes, or newlines", () => {
    expect(stringifyEnv({ K: "a b" })).toBe('K="a b"\n');
    expect(stringifyEnv({ K: "a#b" })).toBe('K="a#b"\n');
    expect(stringifyEnv({ K: "l1\nl2" })).toBe('K="l1\\nl2"\n');
  });

  it("prepends comments when provided", () => {
    expect(stringifyEnv({ K: "v" }, { comments: { K: "note" } })).toBe(
      "# note\nK=v\n"
    );
  });
});

describe("parseEnvFile / stringifyEnv round-trips", () => {
  it("round-trips a variety of values", () => {
    const vars = {
      SIMPLE: "value",
      WITH_SPACE: "hello world",
      WITH_HASH: "a#b",
      WITH_EQUALS: "a=b=c",
      WITH_NEWLINE: "line1\nline2",
      EMPTY: "",
    };
    expect(parseEnvFile(stringifyEnv(vars))).toEqual(vars);
  });
});

// ── Audit-flagged edge cases ────────────────────────────────
// These assert the CORRECT post-fix behavior and validate the env-file
// audit fix (`export` prefix stripping + inline comments on quoted values).
describe("parseEnvFile — audit edge cases", () => {
  it("parses `export KEY=val` by stripping the export prefix", () => {
    expect(parseEnvFile("export KEY=val")).toEqual({ KEY: "val" });
  });

  it("strips an inline comment after a quoted value and drops the quotes", () => {
    expect(parseEnvFile('KEY="value" # comment')).toEqual({ KEY: "value" });
  });
});
