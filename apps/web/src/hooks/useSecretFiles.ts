"use client";

import { useQuery, useAction, useMutation } from "convex/react";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Secret file hooks.
 *
 * Everything here talks to Convex DIRECTLY — no Next.js route. The browser
 * already holds an authenticated Convex client, exactly as it does for
 * variables and accounts, so an upload route would be an invented hop AND
 * would cap uploads at Vercel's 4.5 MB request-body limit. Going straight to
 * the action means the ceiling is Convex's 16 MiB argument limit instead.
 *
 * Reads are metadata-only and real-time. File CONTENT is fetched one file at
 * a time, on demand, and is audited server-side on every call — which is why
 * there is no "useAllFileContents".
 */

export interface SecretFile {
  _id: Id<"projectFiles">;
  name: string;
  path: string;
  mode: string;
  contentType?: string;
  size: number;
  sha256: string;
  digestSalt: string;
  description?: string;
  environments: string[];
  projectId: Id<"projects">;
  version: number;
  createdAt: number;
  updatedAt: number;
  access: "read" | "write";
}

export interface DeletedSecretFile {
  _id: Id<"projectFiles">;
  name: string;
  path: string;
  size: number;
  environments: string[];
  deletedAt: number;
  expiresAt: number;
}

/* ─── Reads (metadata only — never decrypts) ────────────────────────── */

export function useSecretFiles(projectId: Id<"projects"> | undefined) {
  return useQuery(
    convexApi.features.files.queries.list,
    projectId ? { projectId } : "skip"
  ) as SecretFile[] | undefined;
}

/**
 * Org-wide remaining upload quota. The project page cannot compute this
 * itself — the cap counts every project in the organization.
 */
export function useSecretFileUploadQuota(
  projectId: Id<"projects"> | undefined
) {
  return useQuery(
    convexApi.features.files.queries.uploadQuota,
    projectId ? { projectId } : "skip"
  ) as { allowed: boolean; current: number; limit: number | null } | undefined;
}

export function useDeletedSecretFiles(projectId: Id<"projects"> | undefined) {
  return useQuery(
    convexApi.features.files.queries.getDeleted,
    projectId ? { projectId } : "skip"
  ) as DeletedSecretFile[] | undefined;
}

export function useSecretFileGrants(fileId: Id<"projectFiles"> | undefined) {
  return useQuery(
    convexApi.features.files.queries.listPermissions,
    fileId ? { fileId } : "skip"
  );
}

/* ─── Writes ────────────────────────────────────────────────────────── */

export function useUploadSecretFile() {
  return useAction(convexApi.features.files.values.uploadFile);
}

/** Decrypt one file. Audited server-side — never call it speculatively. */
export function useGetSecretFileContent() {
  return useAction(convexApi.features.files.values.getFileContent);
}

export function useUpdateSecretFile() {
  return useMutation(convexApi.features.files.mutations.update);
}

export function useDeleteSecretFile() {
  return useMutation(convexApi.features.files.mutations.remove);
}

export function useRestoreSecretFile() {
  return useMutation(convexApi.features.files.mutations.restore);
}

export function useGrantSecretFileAccess() {
  return useMutation(convexApi.features.files.mutations.grantAccess);
}

export function useRevokeSecretFileAccess() {
  return useMutation(convexApi.features.files.mutations.revokeAccess);
}

/* ─── Browser helpers ───────────────────────────────────────────────── */

/**
 * Read a File into base64 without building a giant intermediate string.
 *
 * FileReader's data URL is base64 already, so slicing off the prefix is
 * cheaper and far less stack-hostile than spreading bytes through
 * String.fromCharCode.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Hand decrypted bytes to the browser as a download.
 *
 * Deliberately NOT a Convex storage URL: those are bearer tokens that cannot
 * be revoked without deleting the file, and they would serve ciphertext
 * anyway. The plaintext round-trips through the audited action instead.
 */
export function downloadBase64(
  base64: string,
  filename: string,
  contentType?: string
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: contentType || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick: revoking synchronously can cancel the download
  // in Safari before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Human-readable byte count for the list UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
