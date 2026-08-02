"use client";

import { useRef, useState } from "react";
import { FileKey, Loader2, Upload, X } from "lucide-react";
import { ENVIRONMENTS } from "@/constants/project";
import { formatBytes, type SecretFile } from "@/hooks/useSecretFiles";

export interface FileFormData {
  name: string;
  path: string;
  mode: string;
  description: string;
  environments: string[];
  file: File | null;
}

interface FileFormDrawerProps {
  open: boolean;
  /** Present when editing metadata or replacing an existing file's contents. */
  editing?: SecretFile | null;
  /** Replace-contents mode: the file picker is required, metadata is locked. */
  replaceMode?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (data: FileFormData) => void;
}

const MODES = [
  { value: "0600", label: "0600 — owner read/write" },
  { value: "0400", label: "0400 — owner read-only" },
];

/**
 * Closed drawer renders nothing; an open one is REMOUNTED whenever the target
 * changes. Resetting form state with a `key` is React's recommended pattern
 * and keeps the fields out of an effect — a synchronous setState in an effect
 * body causes the cascading renders the compiler lint rejects.
 */
export function FileFormDrawer(props: FileFormDrawerProps) {
  if (!props.open) return null;
  const target = props.editing?._id ?? "new";
  return (
    <FileFormDrawerBody
      key={`${target}:${props.replaceMode ? "replace" : "edit"}`}
      {...props}
    />
  );
}

function FileFormDrawerBody({
  editing,
  replaceMode = false,
  isSubmitting = false,
  error,
  onClose,
  onSubmit,
}: FileFormDrawerProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [path, setPath] = useState(editing?.path ?? "");
  const [mode, setMode] = useState(editing?.mode ?? "0600");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [environments, setEnvironments] = useState<string[]>(
    editing?.environments ?? ["development"]
  );
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditingMetadata = !!editing && !replaceMode;

  /**
   * Picking a file pre-fills name and path from the filename. It is only a
   * default — the whole point of the feature is that the user controls where
   * the file lands, so both stay editable.
   */
  const acceptFile = (picked: File) => {
    setFile(picked);
    if (!name) setName(picked.name);
    if (!path) setPath(picked.name);
  };

  const toggleEnvironment = (env: string) => {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  };

  const needsFile = !editing || replaceMode;
  const canSubmit =
    !isSubmitting &&
    environments.length > 0 &&
    name.trim().length > 0 &&
    path.trim().length > 0 &&
    (!needsFile || file !== null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name, path, mode, description, environments, file });
  };

  const title = replaceMode
    ? `Replace contents of ${editing?.name}`
    : editing
      ? `Edit ${editing.name}`
      : "Upload secret file";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <FileKey className="h-4 w-4 text-green-600 dark:text-green-500" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 p-4">
          {needsFile && (
            <div>
              <label
                htmlFor="secret-file-input"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                File
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) acceptFile(dropped);
                }}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  dragging
                    ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                <Upload className="mx-auto h-6 w-6 text-zinc-400" />
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {file ? (
                    <span className="font-mono">
                      {file.name} · {formatBytes(file.size)}
                    </span>
                  ) : (
                    "Drop a file here, or"
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 text-xs font-medium text-green-600 hover:underline dark:text-green-500"
                >
                  {file ? "Choose a different file" : "browse"}
                </button>
                <input
                  id="secret-file-input"
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) acceptFile(picked);
                  }}
                />
              </div>
            </div>
          )}

          {!replaceMode && (
            <>
              <div>
                <label
                  htmlFor="secret-file-name"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Name
                </label>
                <input
                  id="secret-file-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Android Upload Keystore"
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              <div>
                <label
                  htmlFor="secret-file-path"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Destination path
                </label>
                <input
                  id="secret-file-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="android/app/upload.jks"
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Relative to the project root. This is where{" "}
                  <code>envpilot pull</code>, the extension, and CI will write
                  it.
                </p>
              </div>

              <div>
                <label
                  htmlFor="secret-file-mode"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  File permissions
                </label>
                <select
                  id="secret-file-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Environments
                </legend>
                <div className="flex flex-wrap gap-3">
                  {ENVIRONMENTS.map((env) => (
                    <label
                      key={env}
                      className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={environments.includes(env)}
                        onChange={() => toggleEnvironment(env)}
                      />
                      {env}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  The same path may exist in other environments, as long as they
                  do not overlap with these.
                </p>
              </fieldset>

              <div>
                <label
                  htmlFor="secret-file-description"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Description (optional)
                </label>
                <input
                  id="secret-file-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            </>
          )}

          {isEditingMetadata && (
            <p className="rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Editing details only. Use Replace to upload new contents.
            </p>
          )}

          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {replaceMode ? "Replace" : editing ? "Save" : "Upload"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
