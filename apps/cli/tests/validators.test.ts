import { describe, it, expect } from "vitest";
import {
  validateEnvVars,
  validateEnvironment,
  validateProjectSlug,
  validateUrl,
  validateToken,
  envKeySchema,
} from "../src/lib/validators.js";

describe("validateEnvironment", () => {
  it("accepts the three known environments", () => {
    expect(validateEnvironment("development")).toBe(true);
    expect(validateEnvironment("staging")).toBe(true);
    expect(validateEnvironment("production")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(validateEnvironment("prod")).toBe(false);
    expect(validateEnvironment("")).toBe(false);
    expect(validateEnvironment("Development")).toBe(false);
  });
});

describe("validateProjectSlug", () => {
  it("accepts lowercase alphanumeric slugs with interior hyphens", () => {
    expect(validateProjectSlug("my-project")).toBe(true);
    expect(validateProjectSlug("app123")).toBe(true);
    expect(validateProjectSlug("a")).toBe(true);
  });

  it("rejects leading/trailing hyphens, uppercase, and empty", () => {
    expect(validateProjectSlug("-bad")).toBe(false);
    expect(validateProjectSlug("bad-")).toBe(false);
    expect(validateProjectSlug("Bad")).toBe(false);
    expect(validateProjectSlug("")).toBe(false);
    expect(validateProjectSlug("has space")).toBe(false);
  });
});

describe("validateUrl", () => {
  it("accepts well-formed URLs", () => {
    expect(validateUrl("https://envpilot.dev")).toBe(true);
    expect(validateUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(validateUrl("not-a-url")).toBe(false);
    expect(validateUrl("")).toBe(false);
  });
});

describe("validateToken", () => {
  it("accepts env_ prefixed 48-char tokens", () => {
    const token = "env_" + "a".repeat(48);
    expect(validateToken(token)).toBe(true);
  });

  it("rejects wrong prefix, wrong length, or bad characters", () => {
    expect(validateToken("env_" + "a".repeat(47))).toBe(false);
    expect(validateToken("env_" + "a".repeat(49))).toBe(false);
    expect(validateToken("tok_" + "a".repeat(48))).toBe(false);
    expect(validateToken("env_" + "!".repeat(48))).toBe(false);
    expect(validateToken("")).toBe(false);
  });
});

describe("envKeySchema", () => {
  it("accepts valid keys and rejects invalid ones", () => {
    expect(envKeySchema.safeParse("API_KEY").success).toBe(true);
    expect(envKeySchema.safeParse("_PRIVATE").success).toBe(true);
    expect(envKeySchema.safeParse("1LEADING").success).toBe(false);
    expect(envKeySchema.safeParse("has-dash").success).toBe(false);
    expect(envKeySchema.safeParse("").success).toBe(false);
  });
});

describe("validateEnvVars", () => {
  it("separates valid from invalid keys", () => {
    const { valid, invalid } = validateEnvVars({
      GOOD_KEY: "value",
      "1BAD": "value",
      "also-bad": "value",
    });
    expect(valid).toEqual({ GOOD_KEY: "value" });
    expect(invalid.map((i) => i.key).sort()).toEqual(["1BAD", "also-bad"]);
    expect(invalid[0].error).toBeTruthy();
  });

  it("flags values that exceed 64KB", () => {
    const { valid, invalid } = validateEnvVars({
      BIG: "x".repeat(65537),
    });
    expect(valid).toEqual({});
    expect(invalid).toHaveLength(1);
    expect(invalid[0].key).toBe("BIG");
  });
});
