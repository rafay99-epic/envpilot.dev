import { describe, expect, it } from "vitest";

import {
  ENVIRONMENT_LIST_TEXT,
  isValidEnvironment,
  unknownEnvironments,
  VALID_ENVIRONMENTS,
} from "@convex/lib/environments";

/**
 * The environment triple was copy-pasted into nine places, and the MCP write
 * path ended up with no server-side check at all, so an environment name
 * like "Production" was written straight through instead of becoming a
 * change request. These assertions pin the shared module every caller now
 * validates against.
 */
describe("environment names", () => {
  it("accepts exactly the three platform environments", () => {
    expect([...VALID_ENVIRONMENTS]).toEqual([
      "development",
      "staging",
      "production",
    ]);
  });

  it("is case sensitive, which is what protection matching relies on", () => {
    // protectedEnvironmentsIn compares with an exact includes(), so
    // "Production" would never match a protected "production" and used to be
    // written directly rather than routed through a change request.
    expect(isValidEnvironment("production")).toBe(true);
    expect(isValidEnvironment("Production")).toBe(false);
    expect(isValidEnvironment("PRODUCTION")).toBe(false);
  });

  it("rejects near misses that previously resolved to zero rows", () => {
    expect(isValidEnvironment("prod")).toBe(false);
    expect(isValidEnvironment("dev")).toBe(false);
    expect(isValidEnvironment("stage")).toBe(false);
    expect(isValidEnvironment("")).toBe(false);
    expect(isValidEnvironment(" production")).toBe(false);
  });

  it("names every unknown value so an error can list them", () => {
    expect(unknownEnvironments(["development", "prod", "Production"])).toEqual([
      "prod",
      "Production",
    ]);
    expect(unknownEnvironments(["development", "production"])).toEqual([]);
  });

  it("exposes a list string for error messages", () => {
    expect(ENVIRONMENT_LIST_TEXT).toBe("development, staging, production");
  });
});
