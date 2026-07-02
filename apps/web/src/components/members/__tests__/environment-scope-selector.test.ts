import { describe, expect, it } from "vitest";

import {
  allEnvironments,
  formatEnvironmentScope,
  isUnrestrictedScope,
  scopeToPayload,
} from "@/components/members/environment-scope-selector";
import { ENVIRONMENTS } from "@/constants/project";

describe("allEnvironments", () => {
  it("returns every known environment", () => {
    expect(allEnvironments()).toEqual(["development", "staging", "production"]);
  });

  it("returns a fresh copy each call (safe to mutate)", () => {
    const first = allEnvironments();
    first.pop();
    expect(allEnvironments()).toHaveLength(ENVIRONMENTS.length);
  });
});

describe("isUnrestrictedScope", () => {
  it("is true when every environment is selected", () => {
    expect(isUnrestrictedScope(allEnvironments())).toBe(true);
  });

  it("is true regardless of selection order or extras", () => {
    expect(isUnrestrictedScope(["production", "development", "staging"])).toBe(
      true
    );
  });

  it("is false when any environment is missing", () => {
    expect(isUnrestrictedScope(["development", "staging"])).toBe(false);
    expect(isUnrestrictedScope(["production"])).toBe(false);
    expect(isUnrestrictedScope([])).toBe(false);
  });
});

describe("scopeToPayload", () => {
  it("sends nothing (undefined) when all environments are checked", () => {
    expect(scopeToPayload(allEnvironments())).toBeUndefined();
  });

  it("sends the selection when production is unchecked", () => {
    expect(scopeToPayload(["development", "staging"])).toEqual([
      "development",
      "staging",
    ]);
  });

  it("sends a single-environment selection as-is", () => {
    expect(scopeToPayload(["development"])).toEqual(["development"]);
  });

  it("sends an empty selection as-is (no environments)", () => {
    expect(scopeToPayload([])).toEqual([]);
  });
});

describe("formatEnvironmentScope", () => {
  it("reads 'All environments' for a missing (unrestricted) scope", () => {
    expect(formatEnvironmentScope(undefined)).toBe("All environments");
    expect(formatEnvironmentScope(null)).toBe("All environments");
  });

  it("reads 'No environments' for an explicit empty (deny-all) scope", () => {
    // Backend rejects [] on write, but a legacy row could carry it — the
    // badge must show deny-all, not the opposite (unrestricted).
    expect(formatEnvironmentScope([])).toBe("No environments");
  });

  it("lists known environments in canonical order", () => {
    expect(formatEnvironmentScope(["staging", "development"])).toBe(
      "development, staging"
    );
    expect(formatEnvironmentScope(["production"])).toBe("production");
  });

  it("appends unknown environments after the known ones", () => {
    expect(formatEnvironmentScope(["qa", "development"])).toBe(
      "development, qa"
    );
  });
});
