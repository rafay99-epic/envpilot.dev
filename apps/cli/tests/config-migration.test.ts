import { describe, it, expect } from "vitest";
// NOTE: We exercise ONLY the pure `migrateLegacyConfigData` transform against
// synthetic config snapshots. We never touch the real on-disk store, so the
// developer's live production session is never at risk from this test.
import { migrateLegacyConfigData } from "../src/lib/config.js";
import type { CLIConfig } from "../src/types/index.js";

describe("migrateLegacyConfigData", () => {
  it("migrates a legacy single-account config losslessly", () => {
    const legacy: CLIConfig = {
      apiUrl: "https://www.envpilot.dev",
      accessToken: "access-abc",
      refreshToken: "refresh-xyz",
      user: { id: "user_1", email: "dev@example.com", name: "Dev" },
      role: "admin",
      activeOrganizationId: "org_1",
      activeProjectId: "proj_1",
    };

    const migrated = migrateLegacyConfigData(legacy);

    // apiUrl is preserved, untouched.
    expect(migrated.apiUrl).toBe("https://www.envpilot.dev");

    // Account created and made active, keyed by user id.
    expect(migrated.activeAccountId).toBe("user_1");
    const account = migrated.accounts?.["user_1"];
    expect(account).toBeDefined();
    expect(account).toMatchObject({
      id: "user_1",
      accessToken: "access-abc",
      refreshToken: "refresh-xyz",
      role: "admin",
      activeOrganizationId: "org_1",
      activeProjectId: "proj_1",
      user: { id: "user_1", email: "dev@example.com", name: "Dev" },
    });

    // Legacy top-level auth fields are stripped (single source of truth).
    expect(migrated.accessToken).toBeUndefined();
    expect(migrated.refreshToken).toBeUndefined();
    expect(migrated.user).toBeUndefined();
    expect(migrated.role).toBeUndefined();
    expect(migrated.activeOrganizationId).toBeUndefined();
    expect(migrated.activeProjectId).toBeUndefined();
  });

  it("is idempotent — a second pass changes nothing", () => {
    const legacy: CLIConfig = {
      apiUrl: "https://www.envpilot.dev",
      accessToken: "access-abc",
      user: { id: "user_1", email: "dev@example.com" },
    };

    const once = migrateLegacyConfigData(legacy);
    const twice = migrateLegacyConfigData(once);

    expect(twice).toEqual(once);
    expect(twice.activeAccountId).toBe("user_1");
    expect(Object.keys(twice.accounts ?? {})).toEqual(["user_1"]);
  });

  it("preserves a session even when the legacy user is missing", () => {
    const legacy: CLIConfig = {
      apiUrl: "https://www.envpilot.dev",
      accessToken: "tokenABCDEF",
    };

    const migrated = migrateLegacyConfigData(legacy);

    const id = migrated.activeAccountId;
    expect(id).toBe("legacy-tokenABC");
    const account = migrated.accounts?.[id!];
    expect(account?.accessToken).toBe("tokenABCDEF");
    expect(account?.user.id).toBe(id);
    expect(migrated.accessToken).toBeUndefined();
  });

  it("does not clobber existing accounts and strips lingering legacy fields", () => {
    const config: CLIConfig = {
      apiUrl: "https://www.envpilot.dev",
      accounts: {
        user_9: {
          id: "user_9",
          user: { id: "user_9", email: "nine@example.com" },
          accessToken: "existing",
        },
      },
      activeAccountId: "user_9",
      // Lingering legacy field that must be stripped without creating an account.
      accessToken: "stale-legacy",
      user: { id: "user_1", email: "dev@example.com" },
    };

    const migrated = migrateLegacyConfigData(config);

    // Existing account untouched; no new account created from the stale field.
    expect(Object.keys(migrated.accounts ?? {})).toEqual(["user_9"]);
    expect(migrated.activeAccountId).toBe("user_9");
    expect(migrated.accessToken).toBeUndefined();
    expect(migrated.user).toBeUndefined();
  });

  it("leaves an already-clean multi-account config unchanged", () => {
    const clean: CLIConfig = {
      apiUrl: "https://www.envpilot.dev",
      accounts: {
        user_1: {
          id: "user_1",
          user: { id: "user_1", email: "dev@example.com" },
          accessToken: "a",
        },
      },
      activeAccountId: "user_1",
    };

    const migrated = migrateLegacyConfigData(clean);
    expect(migrated).toEqual(clean);
  });
});
