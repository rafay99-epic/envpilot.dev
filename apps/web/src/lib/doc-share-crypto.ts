import crypto from "crypto";

/**
 * Passphrase handling for public documentation links.
 *
 * A documentation body is not envelope-encrypted the way a secret value is,
 * so the client-key-in-the-URL-fragment trick that `share-crypto.ts` uses
 * does not apply. The passphrase is instead a second factor verified against
 * a stored hash — and the verification happens inside CONVEX, not here.
 *
 * That split matters. This module only derives the hash; it never decides
 * whether a reader is allowed in. Convex functions are publicly callable, so
 * any "already unlocked" boolean this side could set would be a flag an
 * attacker could simply assert on a direct call. Convex compares the hash on
 * every single read instead, which is not bypassable.
 *
 * scrypt rather than a bare SHA-256 (what the OTP path uses): an OTP is
 * six random digits behind a five-minute window and a five-attempt lockout,
 * while a passphrase is human-chosen, long-lived, and worth the work factor.
 */

/** scrypt cost. N=16384 keeps a single derivation near ~50ms on server CPUs. */
const SCRYPT_N = 16_384;
const SCRYPT_KEYLEN = 32;
/** Node's default maxmem is too small for N=16384 with the default r/p. */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSPHRASE_LENGTH = 8;
export const MAX_PASSPHRASE_LENGTH = 200;

/** A fresh 16-byte salt, hex encoded. Public — it gates nothing on its own. */
export function newPassphraseSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** The unguessable half of a public link. `dshr_` + 64 hex characters. */
export function newShareToken(): string {
  return `dshr_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Derive the stored/compared hash for a passphrase. Same input always yields
 * the same output, which is what lets Convex compare without ever seeing the
 * passphrase itself.
 */
export function derivePassphraseHash(
  passphrase: string,
  salt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      passphrase.normalize("NFKC"),
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived.toString("hex"));
      }
    );
  });
}

/**
 * Cookie holding a verified passphrase hash for one token.
 *
 * The hash, not a signed "unlocked" claim: Convex re-verifies it on every
 * read, so this cookie is a convenience for the reader, never an authority.
 * Scoped to the single share path, HttpOnly so script cannot lift it, and
 * short-lived because the URL it accompanies is already a bearer credential.
 */
export const UNLOCK_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export function unlockCookieName(token: string): string {
  // The token is hex with a fixed prefix, so it is already cookie-name safe.
  return `dshr_unlock_${token.slice(-32)}`;
}
