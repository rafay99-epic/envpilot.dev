/**
 * Shared-account payload serialization helpers.
 *
 * Two distinct payload shapes, both plain JSON strings:
 *
 * 1. **Share payload** — the plaintext that gets client-side encrypted before
 *    it travels through the sharedSecrets machinery (external one-time links).
 *    Discriminated with `t: "account"` so the public viewer can pick the right
 *    render layout even before the server tells it the resourceType.
 *
 * 2. **Vault payload** — the JSON blob stored in WorkOS Vault for an account
 *    (`{"username","password"}`). The reveal route returns this raw string and
 *    the UI parses it back into credentials.
 *
 * All parse functions are defensive: any malformed / unexpected input returns
 * `null` instead of throwing, so callers can branch cleanly.
 */

import { z } from "zod";

/**
 * Shared website-URL validator for account create/update. A website URL must
 * be a valid absolute http(s) URL of at most 2048 characters. Compose with
 * `.or(z.literal(""))` at call sites that allow clearing the field.
 */
export const websiteUrlSchema = z
  .url("Invalid URL")
  .max(2048)
  .refine((url) => /^https?:\/\//i.test(url), {
    message: "Website URL must start with http:// or https://",
  });

/** Whether a string is a safe, clickable http(s) URL. */
export function isSafeHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export interface AccountSharePayload {
  name: string;
  username: string;
  password: string;
  url?: string;
}

export interface AccountVaultPayload {
  username: string;
  password: string;
}

/** Marker written into the share payload JSON to identify account shares. */
const ACCOUNT_SHARE_TYPE = "account" as const;

/**
 * Serialize an account's credentials into the plaintext share payload that is
 * encrypted client-side before creating an external share link.
 */
export function serializeAccountShare(payload: AccountSharePayload): string {
  const out: Record<string, string> = {
    t: ACCOUNT_SHARE_TYPE,
    name: payload.name,
    username: payload.username,
    password: payload.password,
  };
  if (payload.url) {
    out.url = payload.url;
  }
  return JSON.stringify(out);
}

/**
 * Parse a decrypted share payload back into account credentials.
 * Returns `null` for anything that is not a well-formed account share.
 */
export function parseAccountShare(
  plaintext: string
): AccountSharePayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.t !== ACCOUNT_SHARE_TYPE) {
    return null;
  }
  if (
    typeof obj.name !== "string" ||
    typeof obj.username !== "string" ||
    typeof obj.password !== "string"
  ) {
    return null;
  }

  const result: AccountSharePayload = {
    name: obj.name,
    username: obj.username,
    password: obj.password,
  };
  if (typeof obj.url === "string" && obj.url.length > 0) {
    result.url = obj.url;
  }
  return result;
}

/**
 * Serialize credentials into the JSON blob stored in WorkOS Vault for an
 * account. Mirrors what the API route writes on create/rotate.
 */
export function serializeAccountVault(payload: AccountVaultPayload): string {
  return JSON.stringify({
    username: payload.username,
    password: payload.password,
  });
}

/**
 * Parse the raw vault payload string returned by the reveal route into
 * `{ username, password }`. Returns `null` if the blob is malformed.
 */
export function parseAccountVault(s: string): AccountVaultPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.username !== "string" || typeof obj.password !== "string") {
    return null;
  }

  return { username: obj.username, password: obj.password };
}
