import { describe, it, expect } from "vitest";
// NOTE: We exercise ONLY the pure `resolveAccount` identifier-matching helper
// against synthetic in-memory account arrays. We never touch the real
// on-disk config store (`conf`), so the developer's live production session
// is never at risk from this test.
import { resolveAccount } from "../src/commands/accounts.js";
import type { Account } from "../src/types/index.js";

function makeAccount(id: string, email: string, name?: string): Account {
  return {
    id,
    user: { id, email, name },
    accessToken: `token-${id}`,
  };
}

describe("resolveAccount", () => {
  const accounts: Account[] = [
    makeAccount("user_1", "alice@example.com", "Alice"),
    makeAccount("user_2", "Bob@Example.com", "Bob"),
  ];

  it("resolves by exact account id", () => {
    const found = resolveAccount(accounts, "user_2");
    expect(found?.id).toBe("user_2");
  });

  it("resolves by email, case-insensitively", () => {
    const found = resolveAccount(accounts, "ALICE@EXAMPLE.COM");
    expect(found?.id).toBe("user_1");
  });

  it("resolves by email matching a mixed-case stored email", () => {
    const found = resolveAccount(accounts, "bob@example.com");
    expect(found?.id).toBe("user_2");
  });

  it("trims surrounding whitespace before matching", () => {
    const found = resolveAccount(accounts, "  alice@example.com  ");
    expect(found?.id).toBe("user_1");
  });

  it("returns undefined for an unknown identifier", () => {
    const found = resolveAccount(accounts, "nobody@example.com");
    expect(found).toBeUndefined();
  });

  it("returns undefined against an empty account list", () => {
    const found = resolveAccount([], "alice@example.com");
    expect(found).toBeUndefined();
  });

  it("does not fuzzy-match a partial id", () => {
    const found = resolveAccount(accounts, "user_");
    expect(found).toBeUndefined();
  });
});
