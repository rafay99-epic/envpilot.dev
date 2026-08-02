import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isDefinitiveConvexFailure,
  rollbackProvisionedWebhook,
} from "../integration-provider-cleanup";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("integration provider cleanup", () => {
  it("distinguishes definitive Convex failures from ambiguous transport errors", () => {
    const rejected = new Error("Limit reached") as Error & { data: string };
    rejected.data = "Limit reached";
    expect(isDefinitiveConvexFailure(rejected)).toBe(true);
    expect(isDefinitiveConvexFailure(new Error("fetch failed"))).toBe(false);
  });

  it("does not use Slack's workspace-wide token revocation as cleanup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      rollbackProvisionedWebhook("slack", {
        url: "https://hooks.slack.com/services/T/B/secret",
      })
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes only a provider-issued Discord webhook URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      rollbackProvisionedWebhook("discord", {
        url: "https://discord.com/api/webhooks/123/token",
      })
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/123/token",
      expect.objectContaining({ method: "DELETE" })
    );

    await expect(
      rollbackProvisionedWebhook("discord", {
        url: "https://example.com/api/webhooks/123/token",
      })
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
