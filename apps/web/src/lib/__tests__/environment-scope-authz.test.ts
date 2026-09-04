// Subset semantics of developer environment scoping, tested against the
// backend source of truth in convex/authz.ts (resolved via the @convex alias).
import { describe, expect, it } from "vitest";

import { isEnvironmentScopeAllowed } from "@convex/lib/authz";
import { effectiveEnvironments } from "@convex/lib/roleProfiles";
import type { RoleProfile } from "@convex/lib/roleProfiles";

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

// Role default + member-list narrowing, tested against the resolver used by
// every scope read site (assertProjectAction, resolveResourceAccess, etc).
function profile(opts: {
  scoped: boolean;
  environments?: string[];
}): Pick<RoleProfile, "capabilities" | "environments"> {
  return {
    capabilities: opts.scoped ? { "access.env_scoped": true } : {},
    environments: opts.environments,
  };
}

describe("effectiveEnvironments", () => {
  it("returns undefined for a non-scopeable role regardless of any member list", () => {
    const nonScoped = profile({ scoped: false, environments: ["development"] });
    expect(effectiveEnvironments(nonScoped, ["development"])).toBeUndefined();
    expect(effectiveEnvironments(nonScoped, undefined)).toBeUndefined();
  });

  it("returns the role default when no member list is assigned", () => {
    const editor = profile({
      scoped: true,
      environments: ["development", "staging"],
    });
    expect(effectiveEnvironments(editor, undefined)).toEqual([
      "development",
      "staging",
    ]);
  });

  it("narrows the role default to a member list that is a subset", () => {
    const editor = profile({
      scoped: true,
      environments: ["development", "staging"],
    });
    expect(effectiveEnvironments(editor, ["development"])).toEqual([
      "development",
    ]);
  });

  it("uses the explicit member list even when it is wider than the role default", () => {
    const editor = profile({
      scoped: true,
      environments: ["development", "staging"],
    });
    // Widening is refused where the list is WRITTEN
    // (assertEnvironmentScopeNarrows), so a stored list is a deliberate
    // decision and re-narrowing it here would silently strip access the
    // enable-role-environment-defaults migration granted.
    expect(
      effectiveEnvironments(editor, ["development", "production"])
    ).toEqual(["development", "production"]);
  });

  it("returns undefined when both the role default and member list are unrestricted", () => {
    const viewer = profile({ scoped: true, environments: undefined });
    expect(effectiveEnvironments(viewer, undefined)).toBeUndefined();
  });

  it("returns the bare member list when the role default is unrestricted", () => {
    const viewer = profile({ scoped: true, environments: undefined });
    expect(effectiveEnvironments(viewer, ["development"])).toEqual([
      "development",
    ]);
  });
});
