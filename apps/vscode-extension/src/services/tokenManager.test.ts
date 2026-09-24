import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
  },
  window: { createOutputChannel: () => ({ appendLine() {} }) },
}));

const refreshAccessToken = vi.fn();
vi.mock("./workos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workos")>()),
  refreshAccessToken: (rt: string) => refreshAccessToken(rt),
}));

import { TokenManager, TransientAuthError } from "./tokenManager";
import { WorkosAuthError } from "./workos";
import type { StorageService } from "../utils/storage";
import type { AuthSession } from "../types";

const jwt = (exp: number) =>
  `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const expired = jwt(1);
const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);

const account = (refreshToken: string, accessToken = expired): AuthSession => ({
  user: { id: "u1", email: "a@b.c", name: null, avatarUrl: null },
  accessToken,
  refreshToken,
  expiresAt: 0,
});

function setup(reads: AuthSession[][]) {
  const storage = {
    getAuthSession: vi.fn(async () => account("rt1")),
    listAccounts: vi.fn(async () => reads.shift() ?? []),
    updateAccountTokens: vi.fn(async () => {}),
    removeAccount: vi.fn(async () => {}),
  };
  const manager = new TokenManager(storage as unknown as StorageService);
  const dead = vi.fn();
  manager.onSessionDead(dead);
  return { storage, manager, dead };
}

const denied = () =>
  Promise.reject(new WorkosAuthError("rejected", "access_denied"));

describe("TokenManager refresh", () => {
  beforeEach(() => {
    refreshAccessToken.mockReset();
  });

  it("retries with a token another window rotated instead of signing out", async () => {
    refreshAccessToken.mockImplementation((rt: string) =>
      rt === "rt1"
        ? denied()
        : Promise.resolve({ access_token: fresh, refresh_token: "rt3" })
    );
    const { storage, manager, dead } = setup([
      [account("rt1")],
      [account("rt2")],
      [account("rt2")],
    ]);

    await expect(manager.getFreshToken()).resolves.toBe(fresh);
    expect(refreshAccessToken).toHaveBeenCalledWith("rt2");
    expect(storage.removeAccount).not.toHaveBeenCalled();
    expect(dead).not.toHaveBeenCalled();
  });

  it("removes the account and fires onSessionDead when the stored token is rejected", async () => {
    refreshAccessToken.mockImplementation(denied);
    const { storage, manager, dead } = setup([
      [account("rt1")],
      [account("rt1")],
    ]);

    await expect(manager.getFreshToken()).resolves.toBeNull();
    expect(storage.removeAccount).toHaveBeenCalledWith("u1", {
      promote: false,
    });
    expect(dead).toHaveBeenCalledWith("u1");
  });

  it("throws TransientAuthError and keeps the account on a network failure", async () => {
    refreshAccessToken.mockRejectedValue(
      new WorkosAuthError("Could not reach WorkOS", "network")
    );
    const { storage, manager } = setup([[account("rt1")]]);

    await expect(manager.getFreshToken()).rejects.toBeInstanceOf(
      TransientAuthError
    );
    expect(storage.removeAccount).not.toHaveBeenCalled();
  });
});
