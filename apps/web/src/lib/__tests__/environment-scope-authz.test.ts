// Subset semantics of developer environment scoping, tested against the
// backend source of truth in convex/authz.ts (resolved via the @convex alias).
import { describe, expect, it } from "vitest";

import { isEnvironmentScopeAllowed } from "@convex/authz";

describe("isEnvironmentScopeAllowed", () => {
  it("allows everything when the scope is undefined (unrestricted)", () => {
    expect(isEnvironmentScopeAllowed(undefined, ["production"])).toBe(true);
    expect(
      isEnvironmentScopeAllowed(undefined, [
        "development",
        "staging",
        "production",
      ])
    ).toBe(true);
    expect(isEnvironmentScopeAllowed(undefined, [])).toBe(true);
  });

  it("allows a variable whose environments are all inside the scope", () => {
    expect(
      isEnvironmentScopeAllowed(["development", "staging"], ["development"])
    ).toBe(true);
    expect(
      isEnvironmentScopeAllowed(
        ["development", "staging"],
        ["development", "staging"]
      )
    ).toBe(true);
  });

  it("denies a variable when ANY of its environments is outside the scope", () => {
    // Lives in production too — a production-excluded developer must not see it.
    expect(
      isEnvironmentScopeAllowed(
        ["development", "staging"],
        ["development", "production"]
      )
    ).toBe(false);
    expect(isEnvironmentScopeAllowed(["development"], ["staging"])).toBe(false);
  });

  it("denies everything with an empty scope unless the variable has no environments", () => {
    expect(isEnvironmentScopeAllowed([], ["development"])).toBe(false);
    expect(isEnvironmentScopeAllowed([], [])).toBe(true);
  });

  it("a variable with no environments is always within scope", () => {
    expect(isEnvironmentScopeAllowed(["production"], [])).toBe(true);
  });
});
