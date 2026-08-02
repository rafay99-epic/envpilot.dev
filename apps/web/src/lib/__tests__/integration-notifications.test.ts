import { describe, expect, it } from "vitest";
import {
  buildNotificationText,
  buildWebhookRequest,
  deliveryDecision,
  failureCountAfterDelivery,
  MAX_DELIVERY_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  matchesProjectScope,
  providerRetryDelayMilliseconds,
} from "@convex/features/integrations/messages";

const baseMessage = {
  action: "variable.updated",
  details: {
    variableKey: "API_<TOKEN>",
    approvedEnvironments: ["staging", "production", 42],
    value: "must-never-appear",
  },
  actorName: "Ada & Lin",
  projectName: "Web > API",
  link: "http://localhost:3000/organizations/acme",
};

describe("integration notification payloads", () => {
  it("routes organization-wide and project-specific destinations correctly", () => {
    expect(matchesProjectScope(undefined, undefined)).toBe(true);
    expect(matchesProjectScope(undefined, "project-a")).toBe(true);
    expect(matchesProjectScope(["project-a"], "project-a")).toBe(true);
    expect(matchesProjectScope(["project-a", "project-b"], "project-b")).toBe(
      true
    );
    expect(matchesProjectScope(["project-a"], "project-b")).toBe(false);
    expect(matchesProjectScope(["project-a"], undefined)).toBe(false);
  });

  it("builds native Slack mrkdwn and escapes user-controlled metadata", () => {
    const text = buildNotificationText({ provider: "slack", ...baseMessage });
    expect(text).toContain("*API_&lt;TOKEN&gt;*");
    expect(text).toContain("(staging, production)");
    expect(text).toContain("by Ada &amp; Lin");
    expect(text).toContain(
      "<http://localhost:3000/organizations/acme|View in EnvPilot>"
    );
    expect(text).not.toContain("must-never-appear");

    const request = buildWebhookRequest({
      provider: "slack",
      url: "https://hooks.slack.com/services/T/B/X/",
      text,
    });
    expect(request.endpoint).toBe("https://hooks.slack.com/services/T/B/X");
    expect(JSON.parse(request.body)).toEqual({ text });
  });

  it("builds a native Discord payload without Slack compatibility syntax", () => {
    const text = buildNotificationText({ provider: "discord", ...baseMessage });
    expect(text).toContain("**API\\_<TOKEN\\>**");
    expect(text).toContain(
      "[View in EnvPilot](http://localhost:3000/organizations/acme)"
    );
    expect(text).not.toContain("<http://");
    expect(text).not.toContain("must-never-appear");

    const request = buildWebhookRequest({
      provider: "discord",
      url: "https://discord.com/api/webhooks/123/token/",
      text,
    });
    expect(request.endpoint).toBe("https://discord.com/api/webhooks/123/token");
    expect(request.endpoint.endsWith("/slack")).toBe(false);
    expect(JSON.parse(request.body)).toEqual({
      content: text,
      allowed_mentions: { parse: [] },
    });
  });

  it("normalizes a single export environment", () => {
    const text = buildNotificationText({
      provider: "slack",
      action: "variable.exported",
      details: { key: "DATABASE_URL", environment: "development" },
      actorName: "Ada",
      link: "https://envpilot.dev",
    });
    expect(text).toContain("*DATABASE_URL* (development)");
  });

  it.each([
    [
      "invitation.sent",
      { email: "new@example.com", role: "developer" },
      "new@example.com (developer)",
    ],
    [
      "account.permission_granted",
      { accountName: "Stripe", grantedToEmail: "dev@example.com" },
      "Stripe → dev@example.com",
    ],
    ["api.key_created", { name: "Deploy key" }, "Deploy key"],
    [
      "access.extension_unlinked",
      { deviceName: "VS Code on Mac" },
      "VS Code on Mac",
    ],
    [
      "variable.deleted",
      { deletedKeys: ["A", "B", "C", "D"] },
      "A, B, C +1 more",
    ],
  ])("renders an action-aware subject for %s", (action, details, expected) => {
    const text = buildNotificationText({
      provider: "slack",
      action,
      details,
      actorName: "Ada",
      link: "https://envpilot.dev",
    });
    expect(text).toContain(expected);
  });

  it("does not claim an API denial was performed by the key creator", () => {
    const text = buildNotificationText({
      provider: "slack",
      action: "api.request_denied",
      details: { keyName: "Revoked deploy key" },
      actorName: "Key Creator",
      link: "https://envpilot.dev",
    });
    expect(text).toContain("key owner Key Creator");
    expect(text).not.toContain("by Key Creator");
  });

  it.each(["slack", "discord"] as const)(
    "keeps hostile delimiters inside the %s link target",
    (provider) => {
      const text = buildNotificationText({
        provider,
        ...baseMessage,
        link: "https://envpilot.dev/organizations/acme)|<https://evil.test/[x]",
      });

      expect(text).toContain(
        "https://envpilot.dev/organizations/acme%29%7C%3Chttps://evil.test/%5Bx%5D"
      );
      expect(text).not.toContain(")|<https://evil.test");
    }
  );

  it.each(["slack", "discord"] as const)(
    "omits non-HTTP %s link targets",
    (provider) => {
      const text = buildNotificationText({
        provider,
        ...baseMessage,
        link: "javascript:alert(1)",
      });

      expect(text).not.toContain("javascript:");
      expect(text).not.toContain("View in EnvPilot");
    }
  );
});

describe("webhook delivery retry policy", () => {
  it("retries network failures, 5xx, and rate limits before the final attempt", () => {
    expect(deliveryDecision({ status: 0, attempt: 0 })).toEqual({
      retry: true,
      delayMs: 1_000,
    });
    expect(deliveryDecision({ status: 503, attempt: 1 })).toEqual({
      retry: true,
      delayMs: 2_000,
    });
    expect(
      deliveryDecision({
        status: 429,
        attempt: 0,
        retryAfter: "120",
      })
    ).toEqual({ retry: true, delayMs: MAX_RETRY_DELAY_MS });
  });

  it("records terminal responses and stops after the bounded attempt count", () => {
    expect(deliveryDecision({ status: 400, attempt: 0 })).toEqual({
      retry: false,
      delayMs: 0,
    });
    expect(
      deliveryDecision({
        status: 429,
        attempt: MAX_DELIVERY_ATTEMPTS - 1,
        retryAfter: "5",
      })
    ).toEqual({ retry: false, delayMs: 0 });
    expect(deliveryDecision({ status: 204, attempt: 0 })).toEqual({
      retry: false,
      delayMs: 0,
    });
  });

  it("never treats provider throttling as endpoint death", () => {
    expect(failureCountAfterDelivery(429, 7)).toBe(7);
    expect(failureCountAfterDelivery(204, 7)).toBe(0);
    expect(failureCountAfterDelivery(503, 7)).toBe(8);
    expect(failureCountAfterDelivery(0, 7)).toBe(8);
  });

  it("preserves the provider's full embargo even when retry scheduling is capped", () => {
    expect(providerRetryDelayMilliseconds({ retryAfter: "120" })).toBe(120_000);
    expect(
      providerRetryDelayMilliseconds({
        retryAfter: "2",
        discordRetryAfterMs: 3_500,
      })
    ).toBe(3_500);
  });
});
