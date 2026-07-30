import { describe, expect, it } from "vitest";

import {
  AES_GCM_OVERHEAD_BYTES,
  decryptArtifact,
  encryptArtifact,
  sha256Hex,
} from "@/lib/artifact-crypto";

describe("secure artifact browser cryptography", () => {
  it("round-trips plaintext with a fresh AES-256-GCM key", async () => {
    const plaintext = new TextEncoder().encode(
      '{"project_id":"luma","private_key":"test-only"}'
    );
    const encrypted = await encryptArtifact(plaintext.buffer);

    expect(encrypted.payload).toHaveLength(
      plaintext.byteLength + AES_GCM_OVERHEAD_BYTES
    );
    expect(encrypted.encryptionKey).toHaveLength(44);
    expect(await sha256Hex(encrypted.payload)).toBe(encrypted.contentHash);

    const decrypted = await decryptArtifact(
      encrypted.payload,
      encrypted.encryptionKey
    );
    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it("supports an empty configuration file", async () => {
    const encrypted = await encryptArtifact(new ArrayBuffer(0));
    expect(encrypted.payload).toHaveLength(AES_GCM_OVERHEAD_BYTES);
    expect(
      (await decryptArtifact(encrypted.payload, encrypted.encryptionKey))
        .byteLength
    ).toBe(0);
  });

  it("rejects ciphertext that was modified in storage", async () => {
    const encrypted = await encryptArtifact(
      new TextEncoder().encode("signing material").buffer
    );
    encrypted.payload[encrypted.payload.length - 1] ^= 1;

    await expect(
      decryptArtifact(encrypted.payload, encrypted.encryptionKey)
    ).rejects.toThrow();
  });
});
