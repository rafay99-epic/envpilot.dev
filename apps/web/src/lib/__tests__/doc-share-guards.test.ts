// Share guards for project documentation, tested against the backend source
// of truth in convex/features/docs/shareGuards.ts (via the @convex alias),
// plus the passphrase derivation in @/lib/doc-share-crypto.
//
// `resolveShare` itself needs a Convex ctx and is covered end to end by
// tests/e2e/authenticated/doc-sharing.spec.ts. What is unit-testable here is
// the part that is pure and easy to get subtly wrong: the TTL bounds, the
// note bounds, the constant-time compare, and the property the whole
// passphrase design rests on — the same passphrase and salt always derive the
// same hash, because Convex compares hashes and never sees the passphrase.
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  MAX_SHARE_NOTE_LENGTH,
  MAX_SHARE_TTL_MS,
  MIN_SHARE_TTL_MS,
  normalizeNote,
  resolveExpiry,
  timingSafeEqualHex,
} from "@convex/features/docs/shareGuards";
import {
  derivePassphraseHash,
  newPassphraseSalt,
  newShareToken,
} from "@/lib/doc-share-crypto";

const NOW = 1_700_000_000_000;

describe("resolveExpiry", () => {
  it("returns an absolute expiry from a relative TTL", () => {
    expect(resolveExpiry(MIN_SHARE_TTL_MS, NOW)).toBe(NOW + MIN_SHARE_TTL_MS);
  });

  it("accepts the exact bounds", () => {
    expect(() => resolveExpiry(MIN_SHARE_TTL_MS, NOW)).not.toThrow();
    expect(() => resolveExpiry(MAX_SHARE_TTL_MS, NOW)).not.toThrow();
  });

  it("rejects a TTL under an hour", () => {
    expect(() => resolveExpiry(MIN_SHARE_TTL_MS - 1, NOW)).toThrow(ConvexError);
  });

  it("rejects a TTL over 30 days — there is no permanent share", () => {
    expect(() => resolveExpiry(MAX_SHARE_TTL_MS + 1, NOW)).toThrow(ConvexError);
  });

  it("rejects a non-finite TTL rather than producing NaN expiry", () => {
    // A NaN expiresAt compares false against every `<=`, which would make the
    // share immortal — exactly the failure the bound exists to prevent.
    expect(() => resolveExpiry(Number.NaN, NOW)).toThrow(ConvexError);
    expect(() => resolveExpiry(Number.POSITIVE_INFINITY, NOW)).toThrow(
      ConvexError
    );
  });
});

describe("normalizeNote", () => {
  it("passes undefined through", () => {
    expect(normalizeNote(undefined)).toBeUndefined();
  });

  it("treats a whitespace-only note as absent", () => {
    expect(normalizeNote("   \n  ")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeNote("  see the auth section  ")).toBe(
      "see the auth section"
    );
  });

  it("accepts a note at the exact limit", () => {
    const note = "x".repeat(MAX_SHARE_NOTE_LENGTH);
    expect(normalizeNote(note)).toBe(note);
  });

  it("rejects a note over the limit", () => {
    expect(() => normalizeNote("x".repeat(MAX_SHARE_NOTE_LENGTH + 1))).toThrow(
      ConvexError
    );
  });
});

describe("timingSafeEqualHex", () => {
  it("matches identical digests", () => {
    expect(timingSafeEqualHex("abc123", "abc123")).toBe(true);
  });

  it("rejects a different digest of the same length", () => {
    expect(timingSafeEqualHex("abc123", "abc124")).toBe(false);
  });

  it("rejects on a length mismatch instead of comparing a prefix", () => {
    expect(timingSafeEqualHex("abc", "abc123")).toBe(false);
    expect(timingSafeEqualHex("", "a")).toBe(false);
  });

  it("does not treat a shared prefix as a match", () => {
    expect(timingSafeEqualHex("aaaaaa", "aaaaab")).toBe(false);
  });
});

describe("newShareToken", () => {
  it("produces the dshr_ + 64 hex shape the proxy allowlist keys on", () => {
    // proxy.ts opens /api/doc-shares/dshr_* to unauthenticated readers and
    // leaves every other path behind the session check. A token that stopped
    // matching this shape would make every public link 302 to sign-in.
    expect(newShareToken()).toMatch(/^dshr_[0-9a-f]{64}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newShareToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("derivePassphraseHash", () => {
  it("is deterministic for the same passphrase and salt", async () => {
    // The entire unlock design depends on this: the route derives, Convex
    // compares. A non-deterministic derivation would lock out every reader.
    const salt = newPassphraseSalt();
    const first = await derivePassphraseHash("correct-horse", salt);
    const second = await derivePassphraseHash("correct-horse", salt);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for a different passphrase under the same salt", async () => {
    const salt = newPassphraseSalt();
    expect(await derivePassphraseHash("correct-horse", salt)).not.toBe(
      await derivePassphraseHash("correct-hors", salt)
    );
  });

  it("differs for the same passphrase under a different salt", async () => {
    // Per-row salt: two links protected by the same passphrase must not share
    // a stored hash, or cracking one cracks the other.
    expect(
      await derivePassphraseHash("correct-horse", newPassphraseSalt())
    ).not.toBe(
      await derivePassphraseHash("correct-horse", newPassphraseSalt())
    );
  });

  it("normalizes unicode so a visually identical passphrase still opens", async () => {
    const salt = newPassphraseSalt();
    // Precomposed e-acute (U+00E9) versus e + combining acute (U+0301). They
    // render identically and a reader cannot see which one their keyboard
    // emitted, so without NFKC one of the two silently never works.
    const precomposed = "caf\u00e9-pass";
    const decomposed = "cafe\u0301-pass";
    expect(precomposed).not.toBe(decomposed);
    expect(await derivePassphraseHash(precomposed, salt)).toBe(
      await derivePassphraseHash(decomposed, salt)
    );
  });
});
