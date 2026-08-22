import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../src/types/index.js";

const mocks = vi.hoisted(() => ({
  getActiveAccount: vi.fn(),
  refreshAccessToken: vi.fn(),
  commitRefreshedTokens: vi.fn(),
  expireAccountSession: vi.fn(),
  isTokenExpiring: vi.fn(),
}));

vi.mock("../src/lib/config.js", () => ({
  getActiveAccount: mocks.getActiveAccount,
  commitRefreshedTokens: mocks.commitRefreshedTokens,
  expireAccountSession: mocks.expireAccountSession,
}));

vi.mock("../src/lib/workos.js", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

vi.mock("../src/lib/jwt.js", () => ({
  isTokenExpiring: mocks.isTokenExpiring,
}));

import { ensureFreshAccessToken } from "../src/lib/api.js";

function account(id: string): Account {
  return {
    id,
    user: { id, email: `${id}@example.com` },
    accessToken: `access-${id}`,
    refreshToken: `refresh-${id}`,
  };
}

describe("ensureFreshAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTokenExpiring.mockReturnValue(true);
  });

  it("finishes for the account that started the refresh", async () => {
    const accountA = account("account-a");
    const accountB = account("account-b");
    mocks.getActiveAccount
      .mockReturnValueOnce(accountA)
      .mockReturnValue(accountB);
    mocks.refreshAccessToken.mockResolvedValue({
      kind: "success",
      accessToken: "access-a-new",
      refreshToken: "refresh-a-new",
    });
    mocks.commitRefreshedTokens.mockResolvedValue({
      kind: "updated",
      account: { ...accountA, accessToken: "access-a-new" },
    });

    await expect(ensureFreshAccessToken()).resolves.toBe("access-a-new");

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith("refresh-account-a");
    expect(mocks.commitRefreshedTokens).toHaveBeenCalledWith(
      { accountId: "account-a", refreshToken: "refresh-account-a" },
      { accessToken: "access-a-new", refreshToken: "refresh-a-new" }
    );
    expect(mocks.getActiveAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps credentials on a transient refresh failure", async () => {
    mocks.getActiveAccount.mockReturnValue(account("account-a"));
    mocks.refreshAccessToken.mockResolvedValue({
      kind: "transient",
      cause: "rate_limited",
      message: "Session refresh failed. Try again.",
    });

    await expect(ensureFreshAccessToken()).rejects.toMatchObject({
      code: "SESSION_REFRESH_RETRY",
    });
    expect(mocks.commitRefreshedTokens).not.toHaveBeenCalled();
    expect(mocks.expireAccountSession).not.toHaveBeenCalled();
  });

  it("expires only the account whose current token is terminally rejected", async () => {
    mocks.getActiveAccount.mockReturnValue(account("account-a"));
    mocks.refreshAccessToken.mockResolvedValue({
      kind: "terminal",
      cause: "invalid_grant",
      message: "Session refresh failed.",
    });
    mocks.expireAccountSession.mockResolvedValue({ kind: "expired" });

    await expect(ensureFreshAccessToken()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    expect(mocks.expireAccountSession).toHaveBeenCalledWith({
      accountId: "account-a",
      refreshToken: "refresh-account-a",
    });
  });

  it("retries a terminal result when another process stored a newer token", async () => {
    const original = account("account-a");
    const newer = { ...original, refreshToken: "refresh-newer" };
    mocks.getActiveAccount.mockReturnValue(original);
    mocks.refreshAccessToken
      .mockResolvedValueOnce({
        kind: "terminal",
        cause: "invalid_grant",
        message: "Session refresh failed.",
      })
      .mockResolvedValueOnce({
        kind: "success",
        accessToken: "access-final",
        refreshToken: "refresh-final",
      });
    mocks.expireAccountSession.mockResolvedValue({
      kind: "superseded",
      account: newer,
    });
    mocks.commitRefreshedTokens.mockResolvedValue({
      kind: "updated",
      account: {
        ...newer,
        accessToken: "access-final",
        refreshToken: "refresh-final",
      },
    });

    await expect(ensureFreshAccessToken()).resolves.toBe("access-final");
    expect(mocks.refreshAccessToken).toHaveBeenNthCalledWith(
      2,
      "refresh-newer"
    );
  });
});
