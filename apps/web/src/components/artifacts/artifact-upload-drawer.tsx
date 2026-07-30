"use client";

import { useEffect, useState } from "react";
import { FileKey2, Loader2, LockKeyhole, Upload, X } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { MAX_ARTIFACT_PLAINTEXT_BYTES } from "@/lib/artifact-crypto";

export type ArtifactUploadStage = "encrypting" | "uploading" | "finalizing";

interface ArtifactUploadDrawerProps {
  isOpen: boolean;
  mode: "create" | "replace";
  initialName?: string;
  onClose: () => void;
  onSubmit: (
    name: string,
    file: File,
    onStageChange: (stage: ArtifactUploadStage) => void
  ) => Promise<void>;
}

const STAGE_LABELS: Record<ArtifactUploadStage, string> = {
  encrypting: "Encrypting file in your browser…",
  uploading: "Uploading encrypted file…",
  finalizing: "Verifying and finalizing…",
};

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactUploadDrawer({
  isOpen,
  mode,
  initialName,
  onClose,
  onSubmit,
}: ArtifactUploadDrawerProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<ArtifactUploadStage>("encrypting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName ?? "");
    setFile(null);
    setIsSubmitting(false);
    setStage("encrypting");
    setError(null);
  }, [initialName, isOpen, mode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Artifact name is required");
      return;
    }
    if (!file) {
      setError("Choose a file to encrypt and upload");
      return;
    }
    if (file.size > MAX_ARTIFACT_PLAINTEXT_BYTES) {
      setError("Secure artifacts are limited to 50 MiB");
      return;
    }

    setIsSubmitting(true);
    setStage("encrypting");
    try {
      await onSubmit(name.trim(), file, setStage);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Upload failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "replace" ? "Replace Artifact" : "Add Artifact"}
      preventClose={isSubmitting}
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/20">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-900 dark:text-green-200">
              Encrypted before it leaves this device
            </p>
            <p className="mt-1 text-xs leading-5 text-green-700 dark:text-green-400">
              Envpilot generates a fresh AES-256-GCM key in your browser and
              sends only ciphertext to private storage.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="artifact-name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="artifact-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={mode === "replace" || isSubmitting}
            placeholder="android-release-key"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:disabled:bg-zinc-950"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Use a stable name that CLI, VS Code, and CI can reference.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            File <span className="text-red-500">*</span>
          </label>
          {file ? (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-zinc-900">
                <FileKey2 className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={isSubmitting}
                aria-label="Remove selected file"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="artifact-file"
              className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-8 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <Upload className="h-6 w-6 text-zinc-400" />
              <span className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Choose a file
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                JSON, signing keys, certificates, config files · 50 MiB maximum
              </span>
            </label>
          )}
          <input
            id="artifact-file"
            type="file"
            data-testid="secure-artifact-file"
            aria-label="Secure artifact file"
            disabled={isSubmitting}
            onChange={(event) =>
              setFile(event.currentTarget.files?.[0] ?? null)
            }
            className="sr-only"
          />
        </div>

        {isSubmitting && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {STAGE_LABELS[stage]}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Keep this drawer open until the upload is complete.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isSubmitting
              ? "Uploading…"
              : mode === "replace"
                ? "Encrypt and replace"
                : "Encrypt and upload"}
          </button>
        </div>
      </form>
    </DrawerPanel>
  );
}
