import { createHash, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptArtifact } from "./artifacts.js";

describe("secure artifact decryption", () => {
  it("verifies the ciphertext before AES-GCM decryption", async () => {
    const rawKey = randomBytes(32);
    const nonce = randomBytes(12);
    const key = await webcrypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const plaintext = new TextEncoder().encode("android signing config");
    const encrypted = new Uint8Array(
      await webcrypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        plaintext
      )
    );
    const payload = new Uint8Array(nonce.length + encrypted.length);
    payload.set(nonce);
    payload.set(encrypted, nonce.length);

    const result = await decryptArtifact(
      payload,
      rawKey.toString("base64"),
      createHash("sha256").update(payload).digest("hex")
    );
    expect(new TextDecoder().decode(result)).toBe("android signing config");
  });

  it("fails closed on a hash mismatch", async () => {
    await expect(
      decryptArtifact(
        new Uint8Array(28),
        randomBytes(32).toString("base64"),
        "0".repeat(64)
      )
    ).rejects.toThrow("integrity");
  });
});
