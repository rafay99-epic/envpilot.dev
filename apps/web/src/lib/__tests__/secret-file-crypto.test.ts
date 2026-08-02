import { describe, it, expect } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import {
  digest,
  fromBase64,
  newDigestSalt,
  open,
  seal,
  toBase64,
} from "@convex/features/files/crypto";

/**
 * Secret-file envelope crypto.
 *
 * The module is pure and runtime-agnostic on purpose, so it can be exercised
 * here without a Convex deployment. Node exposes the same Web Crypto API the
 * Convex default runtime provides; wire it onto the global if the test
 * runner has not already.
 */
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const bytes = (...values: number[]) => new Uint8Array(values);

describe("secret file crypto", () => {
  it("round-trips a payload unchanged", async () => {
    const plaintext = new TextEncoder().encode(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-real-key\n"
    );
    const sealed = await seal(plaintext);
    const recovered = await open(sealed.ciphertext, sealed.keyMaterial);
    expect(Array.from(recovered)).toEqual(Array.from(plaintext));
  });

  it("round-trips arbitrary binary, including NUL bytes", async () => {
    // A keystore is not text. Anything that assumed UTF-8 would corrupt this.
    const plaintext = new Uint8Array(1024);
    for (let i = 0; i < plaintext.length; i += 1) plaintext[i] = i % 256;

    const sealed = await seal(plaintext);
    const recovered = await open(sealed.ciphertext, sealed.keyMaterial);
    expect(Array.from(recovered)).toEqual(Array.from(plaintext));
  });

  it("produces a fresh key and nonce for every seal", async () => {
    // Nonce reuse under one key is GCM's catastrophic failure. `seal` must
    // never be able to repeat a pair, so identical input must still produce
    // different key material and different ciphertext.
    const plaintext = bytes(1, 2, 3, 4);
    const a = await seal(plaintext);
    const b = await seal(plaintext);

    expect(a.keyMaterial).not.toEqual(b.keyMaterial);
    expect(toBase64(a.ciphertext)).not.toEqual(toBase64(b.ciphertext));

    const keyA = JSON.parse(a.keyMaterial) as { k: string; iv: string };
    const keyB = JSON.parse(b.keyMaterial) as { k: string; iv: string };
    expect(keyA.k).not.toEqual(keyB.k);
    expect(keyA.iv).not.toEqual(keyB.iv);
  });

  it("rejects a tampered ciphertext instead of returning garbage", async () => {
    const sealed = await seal(bytes(9, 8, 7, 6, 5));
    const tampered = new Uint8Array(sealed.ciphertext);
    tampered[0] ^= 0xff;

    // The GCM tag is a free integrity check — a flipped byte must throw, not
    // silently produce a corrupted signing key.
    await expect(open(tampered, sealed.keyMaterial)).rejects.toThrow();
  });

  it("rejects truncated ciphertext", async () => {
    const sealed = await seal(bytes(1, 2, 3, 4, 5, 6, 7, 8));
    const truncated = sealed.ciphertext.slice(0, sealed.ciphertext.length - 4);
    await expect(open(truncated, sealed.keyMaterial)).rejects.toThrow();
  });

  it("rejects malformed key material without attempting a decrypt", async () => {
    const sealed = await seal(bytes(1, 2, 3));
    await expect(open(sealed.ciphertext, "not json")).rejects.toThrow(
      /invalid_key_blob/
    );
    await expect(
      open(
        sealed.ciphertext,
        JSON.stringify({ alg: "A128GCM", k: "x", iv: "y" })
      )
    ).rejects.toThrow(/invalid_key_blob/);
  });

  it("base64 survives a payload larger than the chunk size", () => {
    // toBase64 chunks its String.fromCharCode calls; a payload past one chunk
    // is what proves the chunking is correct rather than accidental.
    const large = new Uint8Array(70_000);
    for (let i = 0; i < large.length; i += 1) large[i] = (i * 7) % 256;
    expect(Array.from(fromBase64(toBase64(large)))).toEqual(Array.from(large));
  });

  it("computes the salted digest the clients recompute locally", async () => {
    // The CLI and the extension recompute this over the LOCAL file with
    // node:crypto. If the two ever disagree, every file reports as modified
    // forever — so assert the exact construction, not just self-consistency.
    const salt = newDigestSalt();
    const plaintext = new TextEncoder().encode("keystore-bytes");

    const actual = await digest(plaintext, salt);
    const expected = createHash("sha256")
      .update(
        Buffer.concat([Buffer.from(salt, "base64"), Buffer.from(plaintext)])
      )
      .digest("base64");

    expect(actual).toEqual(expected);
  });

  it("gives different digests for the same content under different salts", async () => {
    const plaintext = new TextEncoder().encode("same-content");
    const first = await digest(plaintext, newDigestSalt());
    const second = await digest(plaintext, newDigestSalt());
    expect(first).not.toEqual(second);
  });
});
