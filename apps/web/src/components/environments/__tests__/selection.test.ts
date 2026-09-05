import { describe, expect, it } from "vitest";
import {
  protectionState,
  resolveEnvironments,
  spansProtection,
} from "../selection";

const ALL = ["development", "staging", "production"];

describe("resolveEnvironments", () => {
  it("drops a selection the scope no longer allows", () => {
    // The scope arrives after mount: a draft seeded against the full list
    // must not leave an unwritable environment in the submitted set.
    const { options, selected } = resolveEnvironments(
      ["development"],
      ["staging"]
    );
    expect(options).toEqual(["staging"]);
    expect(selected).toEqual([]);
  });

  it("keeps a stored environment outside the scope, locked", () => {
    const { options, locked, selected } = resolveEnvironments(
      ["development"],
      ["development"],
      ["development", "production"]
    );
    expect(options).toEqual(["development", "production"]);
    expect([...locked]).toEqual(["production"]);
    // An unrelated edit must not unassign the resource from production.
    expect(selected).toEqual(["development", "production"]);
  });

  it("returns nothing when the caller may write nowhere", () => {
    expect(resolveEnvironments(["development"], []).selected).toEqual([]);
  });

  it("ignores environments outside the known universe", () => {
    const { options } = resolveEnvironments(["qa"], [...ALL, "qa"]);
    expect(options).toEqual(ALL);
  });
});

describe("protectionState", () => {
  it("proposes when a protected environment is being written", () => {
    const state = protectionState(["production"], undefined, ["production"]);
    expect(state.proposing).toBe(true);
    expect(state.protectedSelected).toEqual(["production"]);
  });

  it("proposes when a protected environment is being REMOVED", () => {
    // The server checks the union, so dropping production is still a proposal.
    const state = protectionState(
      ["development"],
      ["production"],
      ["production"]
    );
    expect(state.proposing).toBe(true);
  });

  it("applies directly when nothing protected is touched", () => {
    expect(
      protectionState(["development"], ["development"], ["production"])
        .proposing
    ).toBe(false);
  });
});

describe("spansProtection", () => {
  it("warns only when one row covers both sides", () => {
    expect(spansProtection(["development", "production"], ["production"])).toBe(
      true
    );
    expect(spansProtection(["production"], ["production"])).toBe(false);
    expect(spansProtection(["development"], ["production"])).toBe(false);
  });
});
