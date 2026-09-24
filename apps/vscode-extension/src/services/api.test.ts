import { describe, it, expect, vi } from "vitest";

const showWarningMessage = vi.fn(async () => undefined);
vi.mock("vscode", () => ({
  window: { showWarningMessage: () => showWarningMessage() },
  commands: { executeCommand: vi.fn() },
}));
vi.mock("../utils/config", () => ({
  getConvexUrl: () => "https://example.convex.cloud",
  getWorkosClientId: () => "client",
}));

const query = vi.fn();
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query = query;
  },
}));

import { ApiService, assertCompletePull } from "./api";
import type { TokenManager } from "./tokenManager";

const meta = {
  role: "developer",
  unifiedRole: "developer",
  assigned: true,
  grantOnly: false,
  environmentScope: null,
  hasWriteAccess: false,
  scopeRestricted: false,
};

describe("assertCompletePull", () => {
  it("rejects decryption failures and truncated pulls, accepts complete ones", () => {
    expect(() =>
      assertCompletePull({ ...meta, decryptionFailures: ["API_KEY"] })
    ).toThrow(/API_KEY/);
    expect(() => assertCompletePull({ ...meta, truncatedAt: 1000 })).toThrow(
      /1000/
    );
    expect(() =>
      assertCompletePull({ ...meta, decryptionFailures: [] })
    ).not.toThrow();
  });
});

describe("ApiService auth retry", () => {
  it("force-refreshes and retries once when Convex rejects a locally fresh token", async () => {
    const getFreshToken = vi.fn(async (force?: boolean) =>
      force ? "token-2" : "token-1"
    );
    query
      .mockRejectedValueOnce(new Error("Unauthenticated: no identity"))
      .mockResolvedValueOnce([]);
    const api = new ApiService({ getFreshToken } as unknown as TokenManager);

    await expect(api.getVariableRequests("p1", "pending")).resolves.toEqual([]);
    expect(getFreshToken).toHaveBeenLastCalledWith(true);
    expect(showWarningMessage).not.toHaveBeenCalled();
  });
});
