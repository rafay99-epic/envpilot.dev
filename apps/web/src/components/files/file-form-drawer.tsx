"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import {
  ENVIRONMENTS,
  type Environment,
  envToggleClasses,
  pickAllowedEnvironments,
} from "@/constants/project";
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
  /** Environments this project protects; selecting one turns save into a proposal. */
  protectedEnvironments?: readonly string[];
  /** Environments the caller may write to. Defaults to all of them. */
  allowedEnvironments?: readonly string[];
}

const MODES = [
  { value: "0600", label: "0600 — owner read/write" },
  { value: "0400", label: "0400 — owner read-only" },
];

const inputClasses =
  "mt-1 block w-full rounded-lg border px-4 py-2 text-sm focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle";

export function FileFormDrawer({
  isOpen,
  onClose,
  onSubmit,
  file,
  replaceMode = false,
  protectedEnvironments,
  allowedEnvironments,
}: FileFormDrawerProps) {
  const isEditing = !!file;

  // Submitting belongs to the request, not to the file being edited, so it
  // stays out here with the panel it locks.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Promise.finally rather than a finally block: React Compiler cannot lower
  // a try statement with a finalizer, and it bails on the whole component
  // when it hits one, so the component loses automatic memoization.
  const handleSubmit = (data: FileFormData) => {
    setIsSubmitting(true);
    return onSubmit(data).finally(() => setIsSubmitting(false));
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
      {/* The panel unmounts its children while closed and the key restarts the
          form when the drawer is pointed at another file, so the fields start
          from the file instead of being copied into state by an effect that
          renders one stale frame first. */}
      <FileForm
        key={file?._id ?? "new"}
        file={file ?? null}
        replaceMode={replaceMode}
        onSubmit={handleSubmit}
        onCancel={onClose}
        isSubmitting={isSubmitting}
        protectedEnvironments={protectedEnvironments}
        allowedEnvironments={allowedEnvironments}
      />
    </DrawerPanel>
  );
}

interface FileFormProps {
  file: SecretFile | null;
  replaceMode: boolean;
  onSubmit: (data: FileFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  protectedEnvironments?: readonly string[];
  allowedEnvironments?: readonly string[];
}

function FileForm({
  file,
  replaceMode,
  onSubmit,
  onCancel,
  isSubmitting,
  protectedEnvironments,
  allowedEnvironments = ENVIRONMENTS,
}: FileFormProps) {
  const isEditing = !!file;
  const needsUpload = !isEditing || replaceMode;

  const [name, setName] = useState(file?.name ?? "");
  const [path, setPath] = useState(file?.path ?? "");
  const [mode, setMode] = useState(file?.mode ?? "0600");
  const [description, setDescription] = useState(file?.description ?? "");
  const [environments, setEnvironments] = useState<Environment[]>(() =>
    pickAllowedEnvironments(
      (file?.environments as Environment[] | undefined) ?? ["development"],
      allowedEnvironments
    )
  );
  const [picked, setPicked] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    }
  };

  // Union with the file's stored environments — the server checks the union
  // of current and proposed environments, so removing a protected one is
  // still a proposal.
  const touchedEnvironments = new Set([
    ...((file?.environments as Environment[] | undefined) ?? []),
    ...environments,
  ]);
  const protectedSelected = [...touchedEnvironments].filter((env) =>
    protectedEnvironments?.includes(env)
  );
  const isProposal = protectedSelected.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg p-3 text-sm bg-danger-soft text-danger">
          {error}
        </div>
      )}

      {needsUpload && (
        <div>
          <label
            htmlFor="secret-file-input"
            className="block text-sm font-medium text-ink-muted"
          >
            File <span className="text-danger">*</span>
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
              dragging ? "border-line-strong bg-surface-raised" : "border-line"
            }`}
          >
            <Upload className="mx-auto h-6 w-6 text-ink-muted" />
            <p className="mt-2 text-sm text-ink-muted">
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
              className="mt-2 text-sm font-medium underline-offset-2 hover:underline text-ink"
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
              className="block text-sm font-medium text-ink-muted"
            >
              Name <span className="text-danger">*</span>
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
              className="block text-sm font-medium text-ink-muted"
            >
              Destination path <span className="text-danger">*</span>
            </label>
            <input
              id="secret-file-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="android/app/upload.jks"
              className={`${inputClasses} font-mono`}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Relative to the project root — where{" "}
              <code className="font-mono">envpilot pull</code>, the extension,
              and CI will write it.
            </p>
          </div>

          <div>
            <label
              htmlFor="secret-file-mode"
              className="block text-sm font-medium text-ink-muted"
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
              className="block text-sm font-medium text-ink-muted"
            >
              Description <span className="text-ink-muted">(optional)</span>
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
            <legend className="block text-sm font-medium text-ink-muted">
              Environments <span className="text-danger">*</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {allowedEnvironments.map((env) => (
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
            <p className="mt-1 text-xs text-ink-muted">
              The same path may exist in other environments, as long as they do
              not overlap with these.
            </p>
          </fieldset>
        </>
      )}

      {replaceMode && (
        <p className="text-xs text-ink-muted">
          Replacing contents only. The name, path, and environments stay as they
          are.
        </p>
      )}

      {isProposal && (
        <p data-testid="file-protected-note" className="text-xs text-warning">
          {protectedSelected.join(", ")}{" "}
          {protectedSelected.length > 1 ? "are" : "is"} protected. A second
          person applies this change.
        </p>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 text-ink-muted hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="file-submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting
            ? "Saving…"
            : isProposal
              ? "Propose change"
              : replaceMode
                ? "Replace Contents"
                : isEditing
                  ? "Save Changes"
                  : "Upload File"}
        </button>
      </div>
    </form>
  );
}
