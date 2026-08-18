import { describe, it, expect } from "vitest";
import {
  checkRequired,
  isBlocking,
  parseKeyList,
  describeProblem,
  type Problem,
} from "../src/lib/secrets/problems.js";

describe("isBlocking", () => {
  // This classification decides whether `run` spawns your server. Getting it
  // wrong in either direction is the bug this whole module exists to prevent.
  it("blocks on a set that is silently short", () => {
    expect(isBlocking({ kind: "decrypt-failed", keys: ["A"] })).toBe(true);
    expect(isBlocking({ kind: "truncated", limit: 500 })).toBe(true);
    expect(isBlocking({ kind: "missing-required", keys: ["A"] })).toBe(true);
  });

  it("does not block on a set that is complete for what was asked", () => {
    expect(isBlocking({ kind: "scope-restricted" })).toBe(false);
    expect(
      isBlocking({
        kind: "other-environments",
        keys: [{ key: "A", environments: ["production"] }],
      })
    ).toBe(false);
  });
});

describe("checkRequired", () => {
  it("returns null when every required key is present", () => {
    expect(checkRequired({ A: "1", B: "2" }, ["A", "B"])).toBeNull();
  });

  it("counts a value inherited from the shell as satisfied", () => {
    // The check runs against the COMPOSED env, so exporting a value yourself
    // is a legitimate way to satisfy a requirement.
    expect(checkRequired({ FROM_SHELL: "x" }, ["FROM_SHELL"])).toBeNull();
  });

  it("treats an empty string as missing", () => {
    // An empty value is the shape a stripped variable takes far more often
    // than a deliberate one, so it must not pass a requirement check.
    expect(checkRequired({ A: "" }, ["A"])).toEqual({
      kind: "missing-required",
      keys: ["A"],
    });
  });

  it("reports every missing key, not just the first", () => {
    expect(checkRequired({ B: "2" }, ["A", "B", "C"])?.keys).toEqual([
      "A",
      "C",
    ]);
  });

  it("returns null for an empty requirement list", () => {
    expect(checkRequired({}, [])).toBeNull();
  });
});

describe("parseKeyList", () => {
  it("splits commas, merges repeats, trims and dedupes", () => {
    expect(parseKeyList(["A, B", "B,C", " D "])).toEqual(["A", "B", "C", "D"]);
  });

  it("returns an empty list for undefined or blank input", () => {
    expect(parseKeyList(undefined)).toEqual([]);
    expect(parseKeyList(["", " , "])).toEqual([]);
  });
});

describe("describeProblem", () => {
  it("names the keys so the message is actionable on its own", () => {
    const problem: Problem = {
      kind: "missing-required",
      keys: ["WORKOS_COOKIE_PASSWORD"],
    };
    expect(describeProblem(problem)).toContain("WORKOS_COOKIE_PASSWORD");
  });

  it("summarises rather than dumping a long list", () => {
    const keys = ["A", "B", "C", "D", "E", "F", "G"];
    const text = describeProblem({ kind: "decrypt-failed", keys });
    expect(text).toContain("+2 more");
    expect(text).not.toContain("G");
  });

  it("uses singular wording for one key", () => {
    const text = describeProblem({ kind: "missing-required", keys: ["A"] });
    expect(text).toContain("1 required variable missing");
  });
});
