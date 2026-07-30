import * as path from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import axios from "axios";
import type { ApiService } from "./api";
import type { SecureArtifact } from "../types";

async function decrypt(
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

async function writePrivate(target: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    await chmod(target, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function syncArtifacts(
  api: ApiService,
  artifacts: SecureArtifact[],
  destinationDirectory: string
): Promise<string[]> {
  const outputs: string[] = [];
  for (const artifact of artifacts) {
    const details = await api.getArtifactDownload(artifact._id);
    const response = await axios.get<ArrayBuffer>(details.downloadUrl, {
      responseType: "arraybuffer",
      maxContentLength: 50 * 1024 * 1024 + 28,
      maxBodyLength: 50 * 1024 * 1024 + 28,
    });
    const payload = new Uint8Array(response.data);
    const plaintext = await decrypt(
      payload,
      details.encryptionKey,
      details.contentHash
    );
    const safeName = path.basename(details.fileName);
    if (!safeName || safeName === "." || safeName === "..") {
      throw new Error("Artifact filename is invalid");
    }
    const output = path.resolve(destinationDirectory, safeName);
    await writePrivate(output, plaintext);
    outputs.push(output);
  }
  return outputs;
}
