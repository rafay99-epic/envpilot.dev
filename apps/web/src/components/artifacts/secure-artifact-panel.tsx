"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Download,
  FileKey2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ArtifactUploadDrawer,
  type ArtifactUploadStage,
} from "./artifact-upload-drawer";
import {
  asOwnedBuffer,
  decryptArtifact,
  encryptArtifact,
  MAX_ARTIFACT_PLAINTEXT_BYTES,
  sha256Hex,
} from "@/lib/artifact-crypto";

interface SecureArtifactPanelProps {
  projectId: Id<"projects">;
  canUpload: boolean;
  canReplace: boolean;
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

type DrawerTarget =
  | { mode: "create" }
  | { mode: "replace"; artifact: ArtifactListItem }
  | null;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function SecureArtifactPanel({
  projectId,
  canUpload,
  canReplace,
  canDelete,
}: SecureArtifactPanelProps) {
  const artifacts = useQuery(api.features.artifacts.queries.listForProject, {
    projectId,
  }) as ArtifactListItem[] | undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget>(null);

  const uploadFile = async (
    file: File,
    artifactName: string,
    artifactId: Id<"artifacts"> | undefined,
    onStageChange: (stage: ArtifactUploadStage) => void
  ) => {
    if (file.size > MAX_ARTIFACT_PLAINTEXT_BYTES) {
      throw new Error("Secure artifacts are limited to 50 MiB");
    }

    setBusy(artifactId ? `replace:${artifactId}` : "upload");
    let pendingArtifactId: string | undefined;
    let pendingVersion: number | undefined;
    try {
      onStageChange("encrypting");
      const encrypted = await encryptArtifact(await file.arrayBuffer());
      const session = await fetch("/api/artifacts", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          artifactId,
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
        version?: number;
        error?: string;
      };
      if (
        !session.ok ||
        !sessionBody.uploadUrl ||
        !sessionBody.artifactId ||
        !sessionBody.version
      ) {
        throw new Error(sessionBody.error || "Could not create upload session");
      }
      pendingArtifactId = sessionBody.artifactId;
      pendingVersion = sessionBody.version;

      onStageChange("uploading");
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(sessionBody.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: asOwnedBuffer(encrypted.payload),
        });
      } catch {
        throw new Error(
          `Could not reach Backblaze B2. Allow ${window.location.origin} in the bucket's S3-compatible CORS rules.`
        );
      }
      if (!uploadResponse.ok) {
        throw new Error(
          `Backblaze B2 rejected the upload (${uploadResponse.status}). Verify the bucket credentials and CORS rules.`
        );
      }

      onStageChange("finalizing");
      const complete = await fetch(
        `/api/artifacts/${sessionBody.artifactId}/complete?version=${sessionBody.version}`,
        {
          method: "POST",
          cache: "no-store",
        }
      );
      if (!complete.ok) {
        const body = (await complete.json()) as { error?: string };
        throw new Error(body.error || "Could not complete artifact upload");
      }
      pendingArtifactId = undefined;
      toast.success(
        artifactId
          ? "Encrypted artifact replaced with a new version"
          : "Encrypted artifact uploaded"
      );
    } catch (error) {
      if (pendingArtifactId) {
        const query =
          pendingVersion !== undefined ? `?version=${pendingVersion}` : "";
        await fetch(`/api/artifacts/${pendingArtifactId}/cancel${query}`, {
          method: "POST",
          cache: "no-store",
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      setBusy(null);
    }
  };

  const submitDrawer = async (
    name: string,
    file: File,
    onStageChange: (stage: ArtifactUploadStage) => void
  ) => {
    const target = drawerTarget;
    if (!target) throw new Error("Upload drawer is not ready");
    await uploadFile(
      file,
      name,
      target.mode === "replace" ? target.artifact._id : undefined,
      onStageChange
    );
    setDrawerTarget(null);
  };

  const download = async (artifactId: Id<"artifacts">, fileName: string) => {
    setBusy(`download:${artifactId}`);
    try {
      const response = await fetch(`/api/artifacts/${artifactId}`, {
        cache: "no-store",
      });
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
      const downloadedHash = await sha256Hex(payload);
      if (!details.contentHash || downloadedHash !== details.contentHash) {
        throw new Error("Artifact integrity check failed");
      }
      const plaintext = await decryptArtifact(payload, details.encryptionKey);
      const url = URL.createObjectURL(
        new Blob([plaintext], {
          type: details.contentType || "application/octet-stream",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = details.fileName || fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
      const response = await fetch(`/api/artifacts/${artifactId}`, {
        method: "DELETE",
      });
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
    <div data-testid="secure-artifacts">
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Artifact Library
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {artifacts === undefined
                ? "Loading encrypted files…"
                : `${artifacts.length} encrypted artifact${artifacts.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {canUpload && (
            <button
              type="button"
              onClick={() => setDrawerTarget({ mode: "create" })}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4" />
              Add Artifact
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {artifacts === undefined ? (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading artifacts…
            </div>
          ) : artifacts.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <FileKey2 className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No secure artifacts yet
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                Add signing keys, service-account files, certificates, and
                private build configuration for this project.
              </p>
              {canUpload && (
                <button
                  type="button"
                  onClick={() => setDrawerTarget({ mode: "create" })}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                  Add your first artifact
                </button>
              )}
            </div>
          ) : (
            artifacts.map((artifact) => (
              <div
                key={artifact._id}
                data-testid="secure-artifact-row"
                className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <FileKey2 className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {artifact.name}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        v{artifact.currentVersion}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {artifact.fileName} · {formatBytes(artifact.originalSize)}{" "}
                      · encrypted {formatBytes(artifact.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canReplace && (
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerTarget({ mode: "replace", artifact })
                      }
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      aria-label={`Replace ${artifact.name}`}
                    >
                      {busy === `replace:${artifact._id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Replace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => download(artifact._id, artifact.fileName)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {busy === `download:${artifact._id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
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
                      {busy === `delete:${artifact._id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <ArtifactUploadDrawer
        isOpen={drawerTarget !== null}
        mode={drawerTarget?.mode ?? "create"}
        initialName={
          drawerTarget?.mode === "replace"
            ? drawerTarget.artifact.name
            : undefined
        }
        onClose={() => {
          if (busy === null) setDrawerTarget(null);
        }}
        onSubmit={submitDrawer}
      />
    </div>
  );
}
