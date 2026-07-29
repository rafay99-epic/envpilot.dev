"use client";

import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Download, KeyRound, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

interface SecureArtifactPanelProps {
  projectId: Id<"projects">;
  canUpload: boolean;
  canDelete: boolean;
}

interface ArtifactListItem {
  _id: Id<"artifacts">;
  name: string;
  fileName: string;
  contentType: string;
  size: number;
  originalSize: number;
  contentHash: string;
  encryptionMode: "managed" | "e2e";
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptFile(file: File): Promise<{
  payload: Uint8Array;
  encryptionKey: string;
  contentHash: string;
}> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ownedBuffer(nonce) },
      key,
      await file.arrayBuffer()
    )
  );
  const payload = new Uint8Array(nonce.length + encrypted.length);
  payload.set(nonce);
  payload.set(encrypted, nonce.length);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  return {
    payload,
    encryptionKey: toBase64(rawKey),
    contentHash: toHex(digest),
  };
}

async function decryptFile(
  payload: Uint8Array,
  encryptionKey: string
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedBuffer(fromBase64(encryptionKey)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ownedBuffer(payload.slice(0, 12)) },
    key,
    ownedBuffer(payload.slice(12))
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function SecureArtifactPanel({
  projectId,
  canUpload,
  canDelete,
}: SecureArtifactPanelProps) {
  const artifacts = useQuery(api.features.artifacts.queries.listForProject, {
    projectId,
  }) as ArtifactListItem[] | undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    const artifactName = name.trim() || file.name;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Secure artifacts are limited to 50 MiB");
      return;
    }

    setBusy("upload");
    try {
      const encrypted = await encryptFile(file);
      const session = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: artifactName,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          encryptedSize: encrypted.payload.byteLength,
          originalSize: file.size,
          contentHash: encrypted.contentHash,
          encryptionKey: encrypted.encryptionKey,
          encryptionMode: "managed",
        }),
      });
      const sessionBody = (await session.json()) as {
        uploadUrl?: string;
        artifactId?: string;
        error?: string;
      };
      if (!session.ok || !sessionBody.uploadUrl || !sessionBody.artifactId) {
        throw new Error(sessionBody.error || "Could not create upload session");
      }

      const uploadResponse = await fetch(sessionBody.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: ownedBuffer(encrypted.payload),
      });
      if (!uploadResponse.ok) throw new Error("B2 upload failed");

      const complete = await fetch(`/api/artifacts/${sessionBody.artifactId}/complete`, {
        method: "POST",
      });
      if (!complete.ok) {
        const body = (await complete.json()) as { error?: string };
        throw new Error(body.error || "Could not complete artifact upload");
      }
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      toast.success("Encrypted artifact uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const download = async (artifactId: Id<"artifacts">, fileName: string) => {
    setBusy(`download:${artifactId}`);
    try {
      const response = await fetch(`/api/artifacts/${artifactId}`);
      const details = (await response.json()) as {
        downloadUrl?: string;
        encryptionKey?: string;
        fileName?: string;
        contentType?: string;
        contentHash?: string;
        error?: string;
      };
      if (!response.ok || !details.downloadUrl || !details.encryptionKey) {
        throw new Error(details.error || "Could not prepare artifact download");
      }
      const encryptedResponse = await fetch(details.downloadUrl);
      if (!encryptedResponse.ok) throw new Error("Could not download artifact");
      const payload = new Uint8Array(await encryptedResponse.arrayBuffer());
      const downloadedHash = toHex(
        new Uint8Array(await crypto.subtle.digest("SHA-256", payload))
      );
      if (!details.contentHash || downloadedHash !== details.contentHash) {
        throw new Error("Artifact integrity check failed");
      }
      const plaintext = await decryptFile(payload, details.encryptionKey);
      const url = URL.createObjectURL(
        new Blob([plaintext], { type: details.contentType || "application/octet-stream" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = details.fileName || fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Artifact decrypted and downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (artifactId: Id<"artifacts">, artifactName: string) => {
    if (!window.confirm(`Delete secure artifact "${artifactName}"?`)) return;
    setBusy(`delete:${artifactId}`);
    try {
      const response = await fetch(`/api/artifacts/${artifactId}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Delete failed");
      toast.success("Artifact deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      data-testid="secure-artifacts"
      className="rounded-xl border border-amber-200 bg-white dark:border-amber-900/40 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-6 py-4 dark:border-amber-900/30">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Secure Build Artifacts</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Encrypted in your browser, stored as ciphertext in Backblaze B2, and decrypted only when you download.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Managed encryption
        </span>
      </div>

      {canUpload && (
        <div className="grid gap-3 border-b border-zinc-200 px-6 py-4 md:grid-cols-[1fr_1fr_auto] dark:border-zinc-800">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Artifact name (e.g. android-release-key)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            ref={fileInput}
            type="file"
            data-testid="secure-artifact-file"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <button
            type="button"
            onClick={upload}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload encrypted file
          </button>
        </div>
      )}

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {artifacts === undefined ? (
          <div className="px-6 py-8 text-sm text-zinc-500">Loading artifacts…</div>
        ) : artifacts.length === 0 ? (
          <div className="px-6 py-8 text-sm text-zinc-500">No secure artifacts yet.</div>
        ) : (
          artifacts.map((artifact) => (
            <div
              key={artifact._id}
              data-testid="secure-artifact-row"
              className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{artifact.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">v{artifact.currentVersion}</span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {artifact.fileName} · {formatBytes(artifact.originalSize)} · ciphertext {formatBytes(artifact.size)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => download(artifact._id, artifact.fileName)}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {busy === `download:${artifact._id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(artifact._id, artifact.name)}
                    disabled={busy !== null}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    aria-label={`Delete ${artifact.name}`}
                  >
                    {busy === `delete:${artifact._id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
