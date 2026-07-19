import { describe, it, expect } from "vitest";
import { parseAssignment } from "../src/commands/secrets.js";

describe("parseAssignment", () => {
  it("splits on the first = only (values may contain =)", () => {
    const r = parseAssignment("DATABASE_URL=postgres://u:p@h/db?a=1");
    expect(r).toEqual({
      ok: true,
      key: "DATABASE_URL",
      value: "postgres://u:p@h/db?a=1",
    });
  });

  it("accepts an empty value", () => {
    expect(parseAssignment("EMPTY=")).toEqual({
      ok: true,
      key: "EMPTY",
      value: "",
    });
  });

  it("rejects a missing =", () => {
    expect(parseAssignment("NOEQUALS").ok).toBe(false);
  });

  it("rejects a leading = (empty key)", () => {
    expect(parseAssignment("=value").ok).toBe(false);
  });

  it("rejects a lowercase / non-conforming key", () => {
    expect(parseAssignment("api_url=x").ok).toBe(false);
    expect(parseAssignment("1BAD=x").ok).toBe(false);
  });
});

describe("parseAssignment key length", () => {
  it("rejects a key longer than 100 chars", () => {
    expect(parseAssignment("A" + "X".repeat(100) + "=v").ok).toBe(false);
  });

  it("accepts a key of exactly 100 chars", () => {
    expect(parseAssignment("A" + "X".repeat(99) + "=v").ok).toBe(true);
  });
});
