export const MAX_ARTIFACT_PLAINTEXT_BYTES = 50 * 1024 * 1024;
export const AES_GCM_NONCE_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
export const AES_GCM_OVERHEAD_BYTES = AES_GCM_NONCE_BYTES + AES_GCM_TAG_BYTES;
export const MAX_ARTIFACT_ENCRYPTED_BYTES =
  MAX_ARTIFACT_PLAINTEXT_BYTES + AES_GCM_OVERHEAD_BYTES;

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", ownedBuffer(bytes)))
  );
}

export async function encryptArtifact(plaintext: ArrayBuffer): Promise<{
  payload: Uint8Array;
  encryptionKey: string;
  contentHash: string;
}> {
  if (plaintext.byteLength > MAX_ARTIFACT_PLAINTEXT_BYTES) {
    throw new Error("Secure artifacts are limited to 50 MiB");
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(AES_GCM_NONCE_BYTES));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ownedBuffer(nonce) },
      key,
      plaintext
    )
  );
  const payload = new Uint8Array(nonce.length + encrypted.length);
  payload.set(nonce);
  payload.set(encrypted, nonce.length);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    payload,
    encryptionKey: toBase64(rawKey),
    contentHash: await sha256Hex(payload),
  };
}

export async function decryptArtifact(
  payload: Uint8Array,
  encryptionKey: string
): Promise<ArrayBuffer> {
  if (payload.byteLength < AES_GCM_OVERHEAD_BYTES) {
    throw new Error("Encrypted artifact payload is invalid");
  }

  const rawKey = fromBase64(encryptionKey);
  if (rawKey.byteLength !== 32) {
    throw new Error("Artifact encryption key is invalid");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    ownedBuffer(rawKey),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ownedBuffer(payload.slice(0, AES_GCM_NONCE_BYTES)),
    },
    key,
    ownedBuffer(payload.slice(AES_GCM_NONCE_BYTES))
  );
}

export function asOwnedBuffer(bytes: Uint8Array): ArrayBuffer {
  return ownedBuffer(bytes);
}
