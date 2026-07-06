import { describe, expect, it } from "vitest";
import { compareVersions, evaluateVersion } from "./version-check.js";

describe("compareVersions", () => {
  it("orders by major, minor, then patch", () => {
    expect(compareVersions("1.12.1", "1.12.0")).toBe(1);
    expect(compareVersions("1.12.0", "1.12.1")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1); // numeric, not lexical
  });

  it("treats equal versions as 0", () => {
    expect(compareVersions("1.13.0", "1.13.0")).toBe(0);
  });

  it("pads missing segments with 0 and ignores pre-release suffixes", () => {
    expect(compareVersions("1.13", "1.13.0")).toBe(0);
    expect(compareVersions("1.13.0-beta.1", "1.13.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBe(-1);
  });
});

describe("evaluateVersion", () => {
  const LATEST = "1.13.0";
  const MIN = "1.12.1";

  it("blocks versions below the minimum", () => {
    expect(evaluateVersion("1.11.0", LATEST, MIN)).toEqual({
      blocked: true,
      updateAvailable: LATEST,
    });
    expect(evaluateVersion("1.12.0", LATEST, MIN).blocked).toBe(true);
  });

  it("does not block at exactly the minimum, but flags the update", () => {
    expect(evaluateVersion(MIN, LATEST, MIN)).toEqual({
      blocked: false,
      updateAvailable: LATEST,
    });
  });

  it("is fully clean on the latest version", () => {
    expect(evaluateVersion(LATEST, LATEST, MIN)).toEqual({
      blocked: false,
      updateAvailable: null,
    });
  });

  it("never flags an update for a version ahead of latest (dev builds)", () => {
    expect(evaluateVersion("1.99.0", LATEST, MIN)).toEqual({
      blocked: false,
      updateAvailable: null,
    });
  });

  it("fails open when the server data is unavailable", () => {
    expect(evaluateVersion("1.0.0", undefined, undefined)).toEqual({
      blocked: false,
      updateAvailable: null,
    });
  });
});
