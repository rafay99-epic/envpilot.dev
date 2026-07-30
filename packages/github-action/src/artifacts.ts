import {
  chmodSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import type { EnvpilotArtifact } from "./api.js";

export async function decryptArtifact(
  payload: Uint8Array,
  encryptionKey: string,
  expectedHash: string
): Promise<Uint8Array> {
  const actualHash = createHash("sha256").update(payload).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error("Artifact integrity check failed");
  }
  if (payload.byteLength < 28) {
    throw new Error("Encrypted artifact payload is invalid");
  }
  const rawKey = Buffer.from(encryptionKey, "base64");
  if (rawKey.byteLength !== 32) {
    throw new Error("Artifact encryption key is invalid");
  }
  const key = await webcrypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return new Uint8Array(
    await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.slice(0, 12) },
      key,
      payload.slice(12)
    )
  );
}

export async function downloadArtifact(
  artifact: EnvpilotArtifact,
  destinationDirectory: string
): Promise<string> {
  const response = await fetch(artifact.downloadUrl, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`B2 artifact download failed (${response.status})`);
  }
  const payload = new Uint8Array(await response.arrayBuffer());
  const plaintext = await decryptArtifact(
    payload,
    artifact.encryptionKey,
    artifact.contentHash
  );
  const safeName = basename(artifact.fileName);
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error("Artifact filename is invalid");
  }
  const target = resolve(destinationDirectory, safeName);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, plaintext, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }
  return target;
}
