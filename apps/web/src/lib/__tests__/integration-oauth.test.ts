import { describe, expect, it } from "vitest";
import {
  decodeOAuthState,
  encodeOAuthState,
  integrationAppUrlSupportsProvider,
  integrationEligibilityErrorStatus,
  integrationProviderAvailability,
  integrationOAuthStateSchema,
  integrationProviderSchema,
  oauthStateCookie,
  parseIntegrationAppUrl,
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

  it("accepts only supported providers and isolates concurrent cookies", () => {
    expect(integrationProviderSchema.safeParse("teams").success).toBe(false);
    const secondNonce = "8fd0554c-1131-44d9-b898-44e3cf4d85bb";
    expect(oauthStateCookie("slack", state.nonce)).not.toBe(
      oauthStateCookie("slack", secondNonce)
    );
    expect(oauthStateCookie("slack", state.nonce)).not.toBe(
      oauthStateCookie("discord", state.nonce)
    );
    expect(() => oauthStateCookie("slack", "not-a-uuid")).toThrow();
  });

  it("accepts only HTTP(S) application URLs", () => {
    expect(parseIntegrationAppUrl("http://localhost:3000")?.protocol).toBe(
      "http:"
    );
    expect(parseIntegrationAppUrl("https://envpilot.dev")?.protocol).toBe(
      "https:"
    );
    expect(parseIntegrationAppUrl("ftp://envpilot.dev")).toBeNull();
    expect(parseIntegrationAppUrl("not-a-url")).toBeNull();
    expect(parseIntegrationAppUrl(undefined)).toBeNull();
  });

  it("requires a usable callback URL for each provider", () => {
    const configured = { slack: true, discord: true };
    expect(
      integrationProviderAvailability("http://localhost:3000", configured)
    ).toEqual({ slack: false, slackRequiresHttps: true, discord: true });
    expect(
      integrationProviderAvailability("https://envpilot.dev", configured)
    ).toEqual({ slack: true, slackRequiresHttps: false, discord: true });
    expect(integrationProviderAvailability("bad-url", configured)).toEqual({
      slack: false,
      slackRequiresHttps: false,
      discord: false,
    });
    expect(
      integrationProviderAvailability("http://envpilot.dev", configured)
    ).toEqual({
      slack: false,
      slackRequiresHttps: true,
      discord: false,
    });
    expect(
      integrationAppUrlSupportsProvider(
        new URL("http://127.0.0.1:3000"),
        "discord"
      )
    ).toBe(true);
  });

  it("separates malformed IDs, expected denials, and backend failures", () => {
    expect(
      integrationEligibilityErrorStatus(
        new Error(
          'ArgumentValidationError: Path: .organizationId Validator: v.id("organizations")'
        )
      )
    ).toBe(400);

    const denial = new Error("Not a member of this organization") as Error & {
      data: string;
    };
    denial.data = "Not a member of this organization";
    expect(integrationEligibilityErrorStatus(denial)).toBe(403);
    expect(
      integrationEligibilityErrorStatus(new Error("Backend unavailable"))
    ).toBe(502);
  });
});
