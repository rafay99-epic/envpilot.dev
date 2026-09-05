"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import {
  EnvironmentPicker,
  ProtectionNote,
} from "@/components/environments/environment-picker";
import {
  protectionState,
  resolveEnvironments,
} from "@/components/environments/selection";
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
  const [environments, setEnvironments] = useState<string[]>(
    () => file?.environments ?? ["development"]
  );
  const [picked, setPicked] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Replace-contents hides the picker and promises the environments stay as
  // they are, so the file's own list is what ships. Elsewhere the selection
  // is resolved from state: a scope that narrowed after mount must not leave
  // an unwritable environment in the submitted set, and a stored environment
  // outside the caller's scope stays locked rather than being dropped.
  const stored = file?.environments;
  const { options, locked, selected } = resolveEnvironments(
    replaceMode && stored ? stored : environments,
    allowedEnvironments,
    stored
  );
  const { proposing } = protectionState(
    selected,
    stored,
    protectedEnvironments
  );

  const toggleEnvironment = (env: Environment) => {
    setEnvironments(
      selected.includes(env)
        ? selected.filter((e) => e !== env)
        : [...selected, env]
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
    if (selected.length === 0) {
      setError("At least one environment is required");
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim(),
        mode,
        description: description.trim(),
        environments: selected,
        file: picked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg p-3 text-sm bg-danger-soft text-danger">
          {error}
        </div>
      )}

      {needsUpload && <FilePicker picked={picked} onPick={acceptFile} />}

      {!replaceMode && (
        <>
          <FileMetadataFields
            name={name}
            path={path}
            mode={mode}
            description={description}
            onNameChange={setName}
            onPathChange={setPath}
            onModeChange={setMode}
            onDescriptionChange={setDescription}
          />

          <EnvironmentPicker
            allowedEnvironments={options}
            lockedEnvironments={locked}
            selected={selected}
            onToggle={toggleEnvironment}
            protectedEnvironments={protectedEnvironments}
            existingEnvironments={stored}
            testIdPrefix="file"
            hint={
              <p className="mt-1 text-xs text-ink-muted">
                The same path may exist in other environments, as long as they
                do not overlap with these.
              </p>
            }
          />
        </>
      )}

      {replaceMode && (
        <div>
          <p className="text-xs text-ink-muted">
            Replacing contents only. The name, path, and environments stay as
            they are.
          </p>
          <ProtectionNote
            selected={selected}
            existingEnvironments={stored}
            protectedEnvironments={protectedEnvironments}
            testIdPrefix="file"
          />
        </div>
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
          {submitLabel({ isSubmitting, proposing, replaceMode, isEditing })}
        </button>
      </div>
    </form>
  );
}

/** Drop zone and file input for the uploaded secret. */
function FilePicker({
  picked,
  onPick,
}: {
  picked: File | null;
  onPick: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
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
          if (dropped) onPick(dropped);
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
            if (next) onPick(next);
          }}
        />
      </div>
    </div>
  );
}

/** The submit button's wording, which turns on four independent modes. */
function submitLabel({
  isSubmitting,
  proposing,
  replaceMode,
  isEditing,
}: {
  isSubmitting: boolean;
  proposing: boolean;
  replaceMode: boolean;
  isEditing: boolean;
}): string {
  if (isSubmitting) return "Saving…";
  if (proposing) return "Propose change";
  if (replaceMode) return "Replace Contents";
  return isEditing ? "Save Changes" : "Upload File";
}

/** Name, destination path, permissions and description for a secret file. */
function FileMetadataFields({
  name,
  path,
  mode,
  description,
  onNameChange,
  onPathChange,
  onModeChange,
  onDescriptionChange,
}: {
  name: string;
  path: string;
  mode: string;
  description: string;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onModeChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
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
          onChange={(e) => onNameChange(e.target.value)}
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
          onChange={(e) => onPathChange(e.target.value)}
          placeholder="android/app/upload.jks"
          className={`${inputClasses} font-mono`}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Relative to the project root — where{" "}
          <code className="font-mono">envpilot pull</code>, the extension, and
          CI will write it.
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
          onChange={(e) => onModeChange(e.target.value)}
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
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="What this file is used for…"
          rows={2}
          className={inputClasses}
        />
      </div>
    </>
  );
}
