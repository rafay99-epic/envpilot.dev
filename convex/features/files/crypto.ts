/**
 * Secret-file envelope encryption.
 *
 * PURE module — no ctx, no _generated imports — so it can be unit tested
 * directly (see crypto.test.ts) and imported by any runtime that has Web
 * Crypto. Convex's default runtime provides `crypto.subtle` and
 * `crypto.getRandomValues`; these functions must never be called from a
 * Node action, which is why nothing here reaches for a Node built-in.
 *
 * THE MODEL
 *   plaintext --AES-256-GCM--> ciphertext  -> Convex file storage
 *                    key+iv               -> WorkOS Vault (as `keyMaterial`)
 *
 * Neither store alone reveals the file: Convex holds bytes it cannot read,
 * Vault holds a key to something it does not have. This is strictly stronger
 * than the variables model, where the Vault object IS the secret.
 *
 * NONCE SAFETY: GCM's one catastrophic failure is reusing an (key, iv) pair.
 * `seal` mints a FRESH key on every call and never exposes an "encrypt with
 * this existing key" entry point, so reuse is unreachable by construction
 * rather than prevented by a guard someone could later delete. A file update
 * is a fresh seal + a fresh blob, never an in-place re-encrypt.
 */

/** Wire format of the Vault object backing a secret file. */
export interface FileKeyMaterial {
  alg: "A256GCM";
  /** base64 of the 32-byte AES key */
  k: string;
  /** base64 of the 12-byte GCM nonce */
  iv: string;
}

export interface SealedFile {
  /** AES-256-GCM ciphertext with the 16-byte tag appended (WebCrypto layout). */
  ciphertext: Uint8Array;
  /** JSON string to hand to vault.createSecret. Never touches Convex storage. */
  keyMaterial: string;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;

// btoa/atob operate on binary strings. Chunk the conversion: spreading a
// multi-megabyte Uint8Array into String.fromCharCode blows the call stack.
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Copy into a standalone ArrayBuffer for the WebCrypto calls.
 *
 * Two reasons, and both matter. TypeScript models a Uint8Array as a view
 * over `ArrayBufferLike` (possibly a SharedArrayBuffer), which is not
 * assignable to `BufferSource`. More importantly a view may be a WINDOW onto
 * a larger buffer — handing that to subtle.encrypt would silently process
 * the wrong bytes. Copying makes both problems go away.
 */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 16 random bytes, base64. One per file, stored beside the digest. */
export function newDigestSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * sha256(salt || plaintext), base64.
 *
 * Salted so a stolen database cannot be rainbow-tabled back to the contents
 * of a low-entropy file. Clients recompute this over their LOCAL copy using
 * the salt from the metadata — drift detection costs no decrypt and no Vault
 * round trip.
 *
 * ponytail: a salt defeats precomputation, NOT brute force of a genuinely
 * low-entropy file. Upgrade path if that ever matters: move the digest into
 * the Vault key blob, at the cost of one Vault read per status check.
 */
export async function digest(
  plaintext: Uint8Array,
  saltBase64: string
): Promise<string> {
  const salt = fromBase64(saltBase64);
  const buffer = new Uint8Array(salt.length + plaintext.length);
  buffer.set(salt, 0);
  buffer.set(plaintext, salt.length);
  const hash = await crypto.subtle.digest("SHA-256", bufferOf(buffer));
  return toBase64(new Uint8Array(hash));
}

/** Encrypt under a brand-new key. Returns the blob and the Vault payload. */
export async function seal(plaintext: Uint8Array): Promise<SealedFile> {
  const rawKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await crypto.subtle.importKey(
    "raw",
    bufferOf(rawKey),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferOf(iv) },
    key,
    bufferOf(plaintext)
  );
  const material: FileKeyMaterial = {
    alg: "A256GCM",
    k: toBase64(rawKey),
    iv: toBase64(iv),
  };
  return {
    ciphertext: new Uint8Array(ciphertext),
    keyMaterial: JSON.stringify(material),
  };
}

/**
 * Decrypt. THROWS on a tampered or truncated blob — the GCM tag is a free
 * integrity check and the throw is the point. Callers must let it propagate:
 * a partial or sentinel value for a signing key is worse than a failed pull.
 */
export async function open(
  ciphertext: Uint8Array,
  keyMaterial: string
): Promise<Uint8Array> {
  // Validate EVERYTHING here so a tampered vault object always surfaces the
  // documented code. Previously only two narrow shapes were caught: JSON
  // "null" threw a TypeError on property access, non-base64 `k` threw a raw
  // DOMException from atob, and a wrong-length key threw an OperationError
  // from importKey — three different low-level errors for one condition,
  // all of which prod redacts to "Server Error".
  const malformed = () =>
    new Error("File key material is malformed (code=invalid_key_blob)");

  let material: FileKeyMaterial;
  try {
    const parsed: unknown = JSON.parse(keyMaterial);
    if (typeof parsed !== "object" || parsed === null) throw malformed();
    material = parsed as FileKeyMaterial;
  } catch {
    throw malformed();
  }
  if (
    material.alg !== "A256GCM" ||
    typeof material.k !== "string" ||
    typeof material.iv !== "string"
  ) {
    throw malformed();
  }

  let rawKey: Uint8Array;
  let iv: Uint8Array;
  try {
    rawKey = fromBase64(material.k);
    iv = fromBase64(material.iv);
  } catch {
    throw malformed();
  }
  if (rawKey.length !== KEY_BYTES || iv.length !== IV_BYTES) {
    throw malformed();
  }
  const key = await crypto.subtle.importKey(
    "raw",
    bufferOf(rawKey),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferOf(iv) },
    key,
    bufferOf(ciphertext)
  );
  return new Uint8Array(plaintext);
}
