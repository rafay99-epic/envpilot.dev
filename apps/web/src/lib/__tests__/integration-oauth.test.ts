import { describe, expect, it } from "vitest";
import {
  decodeOAuthState,
  encodeOAuthState,
  integrationOAuthStateSchema,
  integrationProviderSchema,
  oauthStateCookie,
} from "../integration-oauth";

const state = {
  provider: "slack" as const,
  organizationId: "org_123",
  slug: "acme",
  nonce: "0f3f3418-8388-45e5-b085-f2bfb75b8558",
};

describe("integration OAuth state", () => {
  it("round-trips a bounded, provider-bound state", () => {
    expect(decodeOAuthState(encodeOAuthState(state))).toEqual(state);
    expect(integrationOAuthStateSchema.parse(state)).toEqual(state);
  });

  it("rejects malformed, oversized, or incomplete state", () => {
    expect(decodeOAuthState("not-json")).toBeNull();
    expect(decodeOAuthState("x".repeat(1_025))).toBeNull();
    expect(
      decodeOAuthState(
        Buffer.from(JSON.stringify({ provider: "slack" })).toString("base64url")
      )
    ).toBeNull();
  });

  it("accepts only supported providers and isolates their cookies", () => {
    expect(integrationProviderSchema.safeParse("teams").success).toBe(false);
    expect(oauthStateCookie("slack")).not.toBe(oauthStateCookie("discord"));
  });
});
