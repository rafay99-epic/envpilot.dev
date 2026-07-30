import {
  chmodSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { ensureFreshAccessToken } from "./api.js";
import { getApiUrl } from "./config.js";

export interface ArtifactListItem {
  _id: string;
  name: string;
  fileName: string;
  originalSize: number;
  currentVersion: number;
  updatedAt: number;
}

interface ArtifactDownload {
  fileName: string;
  contentHash: string;
  downloadUrl: string;
  encryptionKey: string;
}

async function requestJson<T>(path: string): Promise<T> {
  const token = await ensureFreshAccessToken();
  const response = await fetch(new URL(path, `${getApiUrl()}/`), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    redirect: "error",
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error || `Artifact request failed (${response.status})`
    );
  }
  return body as T;
}

export async function listArtifacts(
  projectId: string
): Promise<ArtifactListItem[]> {
  const result = await requestJson<{ artifacts: ArtifactListItem[] }>(
    `/api/artifacts?projectId=${encodeURIComponent(projectId)}`
  );
  return result.artifacts;
}

export async function decryptArtifactPayload(
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
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: payload.slice(0, 12) },
    key,
    payload.slice(12)
  );
  return new Uint8Array(plaintext);
}

function writePrivateFile(outputPath: string, bytes: Uint8Array): void {
  const target = resolve(outputPath);
  mkdirSync(resolve(target, ".."), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Best-effort cleanup; preserve the original failure.
    }
    throw error;
  }
}

export async function pullArtifact(
  artifactId: string,
  outputDirectory: string
): Promise<string> {
  const details = await requestJson<ArtifactDownload>(
    `/api/artifacts/${encodeURIComponent(artifactId)}`
  );
  const encryptedResponse = await fetch(details.downloadUrl, {
    redirect: "error",
  });
  if (!encryptedResponse.ok) {
    throw new Error(
      `B2 artifact download failed (${encryptedResponse.status})`
    );
  }
  const payload = new Uint8Array(await encryptedResponse.arrayBuffer());
  const plaintext = await decryptArtifactPayload(
    payload,
    details.encryptionKey,
    details.contentHash
  );
  const safeFileName = basename(details.fileName);
  if (!safeFileName || safeFileName === "." || safeFileName === "..") {
    throw new Error("Artifact filename is invalid");
  }
  const outputPath = resolve(outputDirectory, safeFileName);
  writePrivateFile(outputPath, plaintext);
  return outputPath;
}
