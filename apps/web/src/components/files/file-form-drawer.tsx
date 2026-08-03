"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { ENVIRONMENTS, type Environment } from "@/constants/project";
import { formatBytes, type SecretFile } from "@/hooks/useSecretFiles";

export interface FileFormData {
  name: string;
  path: string;
  mode: string;
  description: string;
  environments: Environment[];
  file: File | null;
}

interface FileFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FileFormData) => Promise<void>;
  /** Present ⇒ edit mode. */
  file?: SecretFile | null;
  /** Replace-contents mode: a new file is required, metadata is locked. */
  replaceMode?: boolean;
}

const MODES = [
  { value: "0600", label: "0600 — owner read/write" },
  { value: "0400", label: "0400 — owner read-only" },
];

const inputClasses =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500";

/** Same environment pill palette the account drawer uses. */
function envToggleClasses(env: Environment, selected: boolean): string {
  if (!selected) {
    return "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700";
  }
  return env === "production"
    ? "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700"
    : env === "staging"
      ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-700"
      : "bg-green-100 text-green-700 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700";
}

export function FileFormDrawer({
  isOpen,
  onClose,
  onSubmit,
  file,
  replaceMode = false,
}: FileFormDrawerProps) {
  const isEditing = !!file;
  const needsUpload = !isEditing || replaceMode;

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [mode, setMode] = useState("0600");
  const [description, setDescription] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([
    "development",
  ]);
  const [picked, setPicked] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset / hydrate whenever the drawer opens or the target changes — same
  // lifecycle as AccountFormDrawer.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPicked(null);
    setDragging(false);

    if (file) {
      setName(file.name);
      setPath(file.path);
      setMode(file.mode);
      setDescription(file.description ?? "");
      setEnvironments(file.environments as Environment[]);
    } else {
      setName("");
      setPath("");
      setMode("0600");
      setDescription("");
      setEnvironments(["development"]);
    }
  }, [isOpen, file]);

  /**
   * Picking a file seeds name and path from the filename — a starting point
   * only. The whole point of the feature is that the user decides where the
   * file lands, so both stay editable.
   */
  const acceptFile = (next: File) => {
    setPicked(next);
    setName((current) => current || next.name);
    setPath((current) => current || next.name);
  };

  const toggleEnvironment = (env: Environment) => {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsUpload && !picked) {
      setError("Choose a file to upload");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!path.trim()) {
      setError("Destination path is required");
      return;
    }
    if (environments.length === 0) {
      setError("At least one environment is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim(),
        mode,
        description: description.trim(),
        environments,
        file: picked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = replaceMode
    ? "Replace File Contents"
    : isEditing
      ? "Edit File"
      : "Upload Secret File";

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      preventClose={isSubmitting}
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {needsUpload && (
          <div>
            <label
              htmlFor="secret-file-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              File <span className="text-red-500">*</span>
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
              className={`mt-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-zinc-500 bg-zinc-50 dark:bg-zinc-800"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <Upload className="mx-auto h-6 w-6 text-zinc-400" />
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {picked ? (
                  <span className="font-mono text-xs">
                    {picked.name} · {formatBytes(picked.size)}
                  </span>
                ) : (
                  "Drop a keystore, key, or certificate here"
                )}
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-2 text-sm font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
              >
                {picked ? "Choose a different file" : "Browse files"}
              </button>
              <input
                id="secret-file-input"
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  if (next) acceptFile(next);
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
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="secret-file-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Android Upload Keystore"
                className={inputClasses}
              />
            </div>

            <div>
              <label
                htmlFor="secret-file-path"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Destination path <span className="text-red-500">*</span>
              </label>
              <input
                id="secret-file-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="android/app/upload.jks"
                className={`${inputClasses} font-mono`}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Relative to the project root — where{" "}
                <code className="font-mono">envpilot pull</code>, the extension,
                and CI will write it.
              </p>
            </div>

            <div>
              <label
                htmlFor="secret-file-mode"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                File permissions
              </label>
              <select
                id="secret-file-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className={inputClasses}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="secret-file-description"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Description <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="secret-file-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this file is used for…"
                rows={2}
                className={inputClasses}
              />
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Environments <span className="text-red-500">*</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {ENVIRONMENTS.map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => toggleEnvironment(env as Environment)}
                    aria-pressed={environments.includes(env as Environment)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${envToggleClasses(
                      env as Environment,
                      environments.includes(env as Environment)
                    )}`}
                  >
                    {env}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                The same path may exist in other environments, as long as they
                do not overlap with these.
              </p>
            </fieldset>
          </>
        )}

        {replaceMode && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Replacing contents only. The name, path, and environments stay as
            they are.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-4">
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
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting
              ? "Saving…"
              : replaceMode
                ? "Replace Contents"
                : isEditing
                  ? "Save Changes"
                  : "Upload File"}
          </button>
        </div>
      </form>
    </DrawerPanel>
  );
}
