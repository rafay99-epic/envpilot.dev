/**
 * Client-Side Encryption for Secret Sharing
 *
 * Uses AES-256-GCM via the Web Crypto API for zero-knowledge encryption.
 * The encryption key (clientKey) lives only in the URL fragment (#) and
 * is NEVER sent to the server.
 *
 * Security model:
 *   Layer 1: AES-256-GCM with 256-bit random key
 *   Layer 2: Optional passphrase via PBKDF2 key derivation
 *   Layer 3: Server stores ciphertext in WorkOS Vault (envelope encryption)
 */

const IV_LENGTH = 12; // 96-bit IV for GCM
const SALT_LENGTH = 16; // 128-bit salt for PBKDF2
const PBKDF2_ITERATIONS = 100_000;

/**
 * Generate a cryptographically random 256-bit client key.
 */
export function generateClientKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encode a client key to URL-safe base64 (for the URL fragment).
 */
export function clientKeyToBase64Url(key: Uint8Array): string {
  const binary = String.fromCharCode(...key);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a URL-safe base64 string back to a client key.
 */
export function base64UrlToClientKey(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derive an AES-256-GCM CryptoKey from a client key and optional passphrase.
 *
 * Without passphrase: imports clientKey directly as AES key.
 * With passphrase: derives a combined key using PBKDF2(clientKey || passphrase).
 */
async function deriveKey(
  clientKey: Uint8Array,
  passphrase?: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt?: Uint8Array }> {
  if (!passphrase) {
    // Import clientKey directly as AES-GCM key
    const key = await crypto.subtle.importKey(
      "raw",
      clientKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
    return { key };
  }

  // With passphrase: use PBKDF2 to derive a key from clientKey + passphrase
  const useSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Combine clientKey and passphrase as input keying material
  const combined = new Uint8Array(clientKey.length + passphraseBytes.length);
  combined.set(clientKey);
  combined.set(passphraseBytes, clientKey.length);

  // Import combined material as PBKDF2 key
  const baseKey = await crypto.subtle.importKey(
    "raw",
    combined,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Derive AES-256-GCM key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: useSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { key: derivedKey, salt: useSalt };
}

/**
 * Encrypt a plaintext string for sharing.
 *
 * Output format (base64):
 *   Without passphrase: iv[12] + ciphertext + authTag[16]
 *   With passphrase:    salt[16] + iv[12] + ciphertext + authTag[16]
 *
 * @param plaintext - The secret value to encrypt
 * @param clientKey - 256-bit random key (from generateClientKey)
 * @param passphrase - Optional passphrase for additional protection
 * @returns Base64-encoded ciphertext
 */
export async function encryptForShare(
  plaintext: string,
  clientKey: Uint8Array,
  passphrase?: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const { key, salt } = await deriveKey(clientKey, passphrase);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Build output: [salt?] + iv + ciphertext+authTag
  const encryptedBytes = new Uint8Array(encrypted);
  const outputLength =
    (salt ? SALT_LENGTH : 0) + IV_LENGTH + encryptedBytes.length;
  const output = new Uint8Array(outputLength);

  let offset = 0;
  if (salt) {
    output.set(salt, offset);
    offset += SALT_LENGTH;
  }
  output.set(iv, offset);
  offset += IV_LENGTH;
  output.set(encryptedBytes, offset);

  // Encode as base64
  const binary = String.fromCharCode(...output);
  return btoa(binary);
}

/**
 * Decrypt a shared secret.
 *
 * @param encryptedPayload - Base64-encoded ciphertext from encryptForShare
 * @param clientKey - The same 256-bit key used for encryption
 * @param passphrase - The same passphrase used for encryption (if any)
 * @returns Decrypted plaintext string
 */
export async function decryptFromShare(
  encryptedPayload: string,
  clientKey: Uint8Array,
  passphrase?: string
): Promise<string> {
  // Decode base64
  const binary = atob(encryptedPayload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  let offset = 0;
  let salt: Uint8Array | undefined;

  if (passphrase) {
    salt = bytes.slice(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
  }

  const iv = bytes.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const ciphertext = bytes.slice(offset);

  const { key } = await deriveKey(clientKey, passphrase, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Hash a string using SHA-256 and return as hex.
 * Used for OTP hashing before sending to server.
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
