import { createHash, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptArtifactPayload } from "./artifacts.js";

describe("artifact decryption", () => {
  it("verifies and decrypts an AES-256-GCM payload", async () => {
    const rawKey = randomBytes(32);
    const nonce = randomBytes(12);
    const key = await webcrypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const plaintext = new TextEncoder().encode("firebase config");
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
    const hash = createHash("sha256").update(payload).digest("hex");

    const result = await decryptArtifactPayload(
      payload,
      rawKey.toString("base64"),
      hash
    );
    expect(new TextDecoder().decode(result)).toBe("firebase config");
  });

  it("rejects ciphertext whose hash does not match", async () => {
    await expect(
      decryptArtifactPayload(
        new Uint8Array(28),
        randomBytes(32).toString("base64"),
        "0".repeat(64)
      )
    ).rejects.toThrow("integrity");
  });
});
