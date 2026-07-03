// Verifies share-crypto (AES-256-GCM via WebCrypto) round-trips an
// account-shaped payload (see account-payload.ts) both with and without a
// passphrase, and that a wrong passphrase fails to decrypt.
//
// vitest.config.ts runs this suite under `environment: "node"`. Node's
// global `crypto` (globalThis.crypto, including crypto.subtle) has been
// available since Node 19+ without any flag, and share-crypto.ts only calls
// the ambient `crypto` global (never `require("crypto")` / `node:crypto`),
// so no additional setup is required here. If a future Node/vitest
// downgrade removes globalThis.crypto in this environment, the first test
// below will fail fast with a clear "crypto is not defined" error rather
// than hanging — that would be the signal to skip this file rather than
// hack the vitest environment config.
import { describe, expect, it } from "vitest";

import {
  clientKeyToBase64Url,
  base64UrlToClientKey,
  decryptFromShare,
  encryptForShare,
  generateClientKey,
} from "@/lib/share-crypto";
import {
  parseAccountShare,
  serializeAccountShare,
} from "@/lib/account-payload";

describe("share-crypto round-trip with an account payload", () => {
  it("encrypts and decrypts an account share payload without a passphrase", async () => {
    const payload = serializeAccountShare({
      name: "Stripe Dashboard",
      username: "billing@example.com",
      password: "s3cr3t!",
      url: "https://dashboard.stripe.com",
    });
    const clientKey = generateClientKey();

    const encrypted = await encryptForShare(payload, clientKey);
    const decrypted = await decryptFromShare(encrypted, clientKey);

    expect(decrypted).toBe(payload);
    expect(parseAccountShare(decrypted)).toEqual({
      name: "Stripe Dashboard",
      username: "billing@example.com",
      password: "s3cr3t!",
      url: "https://dashboard.stripe.com",
    });
  });

  it("encrypts and decrypts an account share payload with a passphrase", async () => {
    const payload = serializeAccountShare({
      name: "Internal Tool",
      username: "svc-account",
      password: "hunter2",
    });
    const clientKey = generateClientKey();
    const passphrase = "correct horse battery staple";

    const encrypted = await encryptForShare(payload, clientKey, passphrase);
    const decrypted = await decryptFromShare(encrypted, clientKey, passphrase);

    expect(decrypted).toBe(payload);
    expect(parseAccountShare(decrypted)).toEqual({
      name: "Internal Tool",
      username: "svc-account",
      password: "hunter2",
    });
  });

  it("fails to decrypt with the wrong passphrase", async () => {
    const payload = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
    });
    const clientKey = generateClientKey();

    const encrypted = await encryptForShare(payload, clientKey, "right-pass");

    await expect(
      decryptFromShare(encrypted, clientKey, "wrong-pass")
    ).rejects.toThrow();
  });

  it("fails to decrypt with the wrong client key", async () => {
    const payload = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
    });
    const clientKey = generateClientKey();
    const wrongKey = generateClientKey();

    const encrypted = await encryptForShare(payload, clientKey);

    await expect(decryptFromShare(encrypted, wrongKey)).rejects.toThrow();
  });

  it("fails to decrypt when a passphrase was used but is omitted at decrypt time", async () => {
    const payload = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
    });
    const clientKey = generateClientKey();

    const encrypted = await encryptForShare(payload, clientKey, "a-passphrase");

    await expect(decryptFromShare(encrypted, clientKey)).rejects.toThrow();
  });

  it("client key base64url encoding round-trips (URL fragment transport)", async () => {
    const payload = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
    });
    const clientKey = generateClientKey();
    const encoded = clientKeyToBase64Url(clientKey);
    const decodedKey = base64UrlToClientKey(encoded);

    const encrypted = await encryptForShare(payload, clientKey);
    const decrypted = await decryptFromShare(encrypted, decodedKey);

    expect(decrypted).toBe(payload);
  });
});
