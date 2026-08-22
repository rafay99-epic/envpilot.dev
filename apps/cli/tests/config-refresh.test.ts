import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Account } from "../src/types/index.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.ENVPILOT_CONFIG_DIR;
  vi.resetModules();
});

function account(id: string, refreshToken = `refresh-${id}`): Account {
  return {
    id,
    user: { id, email: `${id}@example.com` },
    accessToken: `access-${id}`,
    refreshToken,
  };
}

async function isolatedConfig() {
  const dir = mkdtempSync(join(tmpdir(), "envpilot-config-refresh-"));
  dirs.push(dir);
  process.env.ENVPILOT_CONFIG_DIR = dir;
  vi.resetModules();
  return import("../src/lib/config.js");
}

describe("account-bound refresh persistence", () => {
  it("persists tokens only when the attempted token is still current", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a"));

    const result = await config.commitRefreshedTokens(
      { accountId: "account-a", refreshToken: "refresh-account-a" },
      { accessToken: "access-new", refreshToken: "refresh-new" }
    );

    expect(result).toMatchObject({ kind: "updated" });
    expect(config.getActiveAccount()).toMatchObject({
      id: "account-a",
      accessToken: "access-new",
      refreshToken: "refresh-new",
    });
  });

  it("does not overwrite tokens stored by another process", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a", "refresh-newer"));

    const result = await config.commitRefreshedTokens(
      { accountId: "account-a", refreshToken: "refresh-old" },
      { accessToken: "access-stale", refreshToken: "refresh-stale" }
    );

    expect(result).toMatchObject({
      kind: "superseded",
      account: { refreshToken: "refresh-newer" },
    });
    expect(config.getActiveAccount()?.accessToken).toBe("access-account-a");
  });

  it("serializes overlapping token rotations", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a"));
    const attempt = {
      accountId: "account-a",
      refreshToken: "refresh-account-a",
    };

    const results = await Promise.all([
      config.commitRefreshedTokens(attempt, {
        accessToken: "access-first",
        refreshToken: "refresh-first",
      }),
      config.commitRefreshedTokens(attempt, {
        accessToken: "access-second",
        refreshToken: "refresh-second",
      }),
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual([
      "superseded",
      "updated",
    ]);
    const updated = results.find(({ kind }) => kind === "updated");
    expect(config.getActiveAccount()?.refreshToken).toBe(
      updated?.kind === "updated" ? updated.account.refreshToken : undefined
    );
  });

  it("expires only the rejected account without selecting a fallback", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a"));
    config.upsertAccount(account("account-b"));

    const result = await config.expireAccountSession({
      accountId: "account-a",
      refreshToken: "refresh-account-a",
    });

    expect(result).toEqual({ kind: "expired" });
    expect(config.getActiveAccountId()).toBeUndefined();
    expect(config.listAccounts().map(({ id }) => id)).toEqual(["account-b"]);
  });

  it("does not expire an account whose refresh token already changed", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a", "refresh-newer"));

    const result = await config.expireAccountSession({
      accountId: "account-a",
      refreshToken: "refresh-old",
    });

    expect(result).toMatchObject({
      kind: "superseded",
      account: { refreshToken: "refresh-newer" },
    });
    expect(config.getActiveAccount()?.id).toBe("account-a");
  });

  it("leaves a newly selected account active when another account expires", async () => {
    const config = await isolatedConfig();
    config.upsertAccount(account("account-a"));
    config.upsertAccount(account("account-b"));
    config.setActiveAccount("account-b");

    await config.expireAccountSession({
      accountId: "account-a",
      refreshToken: "refresh-account-a",
    });

    expect(config.getActiveAccount()?.id).toBe("account-b");
    expect(config.listAccounts().map(({ id }) => id)).toEqual(["account-b"]);
  });
});
