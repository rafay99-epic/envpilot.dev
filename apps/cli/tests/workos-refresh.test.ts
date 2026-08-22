import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/env.js", () => ({
  WORKOS_CLIENT_ID: "client_test",
}));

import { refreshAccessToken } from "../src/lib/workos.js";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshAccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a terminal result only for invalid_grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(400, {
          error: "invalid_grant",
          error_description: "Refresh token expired",
        })
      )
    );

    await expect(refreshAccessToken("refresh-a")).resolves.toEqual({
      kind: "terminal",
      cause: "invalid_grant",
      message: "Session refresh failed: Refresh token expired.",
    });
  });

  it("retries a transient response and preserves the session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, { error: "rate_limited" }))
      .mockResolvedValueOnce(
        response(200, {
          access_token: "access-new",
          refresh_token: "refresh-new",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const refresh = refreshAccessToken("refresh-a");
    await vi.runAllTimersAsync();

    await expect(refresh).resolves.toEqual({
      kind: "success",
      accessToken: "access-new",
      refreshToken: "refresh-new",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not treat a malformed success response as a dead session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { access_token: "incomplete" }))
    );

    await expect(refreshAccessToken("refresh-a")).resolves.toMatchObject({
      kind: "transient",
      cause: "invalid_response",
    });
  });
});
