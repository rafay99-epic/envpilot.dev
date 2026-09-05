"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { ENVIRONMENTS, type Environment } from "@/constants/project";
import { EnvironmentPicker } from "@/components/environments/environment-picker";
import {
  protectionState,
  resolveEnvironments,
} from "@/components/environments/selection";
import {
  parseEnvFile,
  type ParsedEnvEntry,
  type EnvParseError,
} from "@/lib/env-parser";
import type { VariableFormData } from "./variable-form";
import type { Tag } from "@/hooks/useTags";
import { TagSelector } from "./tag-selector";

interface BulkPasteFormProps {
  onSubmit: (entries: VariableFormData[]) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  availableTags?: Tag[];
  onCreateTag?: (name: string, color: string) => Promise<void>;
  protectedEnvironments?: readonly string[];
  /** Environments the caller may write to. Defaults to all of them. */
  allowedEnvironments?: readonly string[];
}

/** Stable identity so an omitted `availableTags` never re-renders TagSelector. */
const NO_TAGS: Tag[] = [];

interface SubmitProgress {
  total: number;
  completed: number;
  current: string;
  failures: Array<{ key: string; error: string }>;
}

export function BulkPasteForm({
  onSubmit,
  onCancel,
  submitLabel = "Create All",
  onSubmittingChange,
  availableTags = NO_TAGS,
  onCreateTag,
  protectedEnvironments,
  allowedEnvironments = ENVIRONMENTS,
}: BulkPasteFormProps) {
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<ParsedEnvEntry[]>([]);
  const [errors, setErrors] = useState<EnvParseError[]>([]);
  const [environments, setEnvironments] = useState<string[]>(["development"]);
  const [isSensitive, setIsSensitive] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<SubmitProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function handleTextChange(value: string) {
    setRawText(value);
    setSubmitError(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (!value.trim()) {
        setEntries([]);
        setErrors([]);
        return;
      }
      const result = parseEnvFile(value);
      setEntries(result.entries);
      setErrors(result.errors);
    }, 300);
  }

  // Toggling works off the resolved selection, never off raw state: a scope
  // that narrowed after mount must not resurrect an environment the caller
  // can no longer write to.
  function handleEnvironmentToggle(env: Environment) {
    setEnvironments(
      selected.includes(env)
        ? selected.filter((e) => e !== env)
        : [...selected, env]
    );
  }

  function handleRemoveEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }

  const { options, selected } = resolveEnvironments(
    environments,
    allowedEnvironments
  );
  const { proposing } = protectionState(
    selected,
    undefined,
    protectedEnvironments
  );
  const effectiveSubmitLabel = proposing ? "Propose All" : submitLabel;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (entries.length === 0) {
      setSubmitError("No valid variables to create");
      return;
    }

    if (selected.length === 0) {
      setSubmitError("Select at least one environment");
      return;
    }

    setIsSubmitting(true);
    onSubmittingChange?.(true);
    const progressState: SubmitProgress = {
      total: entries.length,
      completed: 0,
      current: entries[0].key,
      failures: [],
    };
    setProgress(progressState);

    const formDataEntries: VariableFormData[] = entries.map((entry) => ({
      key: entry.key,
      value: entry.value,
      description: "",
      environments: selected,
      isSensitive,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    }));

    try {
      await onSubmit(formDataEntries);
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
      onSubmittingChange?.(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {submitError && (
        <div className="rounded-lg p-3 text-sm bg-danger-soft text-danger">
          {submitError}
        </div>
      )}

      {/* Textarea */}
      <div>
        <label
          htmlFor="env-paste"
          className="block text-sm font-medium text-ink-muted"
        >
          Paste .env contents
        </label>
        <textarea
          ref={textareaRef}
          id="env-paste"
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`# Paste your .env file here\nDATABASE_URL=postgres://localhost:5432/mydb\nAPI_KEY=sk-1234567890\nNEXT_PUBLIC_APP_URL=http://localhost:3000`}
          rows={8}
          className="mt-1 block w-full rounded-lg border px-4 py-3 font-mono text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line bg-surface-raised text-ink placeholder-ink-subtle"
          disabled={isSubmitting}
        />
        {rawText.trim() && (
          <ParseCounts entries={entries.length} errors={errors.length} />
        )}
      </div>

      <ParseWarnings errors={errors} />

      <EnvironmentPicker
        allowedEnvironments={options}
        selected={selected}
        onToggle={handleEnvironmentToggle}
        protectedEnvironments={protectedEnvironments}
        disabled={isSubmitting}
        testIdPrefix="bulk"
        description="Applied to all variables"
        noteSuffix="These will be filed for approval instead of created directly."
      />

      {/* Sensitive toggle */}
      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSensitive}
            onChange={(e) => setIsSensitive(e.target.checked)}
            disabled={isSubmitting}
            className="h-4 w-4"
          />
          <span className="text-sm text-ink-muted">
            Mark all as sensitive{" "}
            <span className="text-ink-muted">(masks values by default)</span>
          </span>
        </label>
      </div>

      {/* Tags */}
      {availableTags.length > 0 && (
        <TagSelector
          availableTags={availableTags}
          selectedTagIds={selectedTagIds}
          onChange={setSelectedTagIds}
          onCreateTag={onCreateTag}
          disabled={isSubmitting}
        />
      )}

      {entries.length > 0 && (
        <div>
          <p className="block text-sm font-medium text-ink-muted">
            Preview ({entries.length})
          </p>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 border-line">
            {entries.map((entry) => (
              <EntryPreview
                key={entry.key}
                entry={entry}
                masked={isSensitive}
                disabled={isSubmitting}
                onRemove={() => handleRemoveEntry(entry.key)}
              />
            ))}
          </div>
        </div>
      )}

      {progress && (
        <SubmitProgressPanel progress={progress} proposing={proposing} />
      )}

      {/* Actions */}
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
          disabled={isSubmitting || entries.length === 0}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
        >
          {isSubmitting
            ? `${proposing ? "Proposing" : "Creating"} ${progress?.completed ?? 0}/${progress?.total ?? 0}...`
            : `${effectiveSubmitLabel} (${entries.length})`}
        </button>
      </div>
    </form>
  );
}

/** Parse warnings from the pasted block, capped at five lines. */
function ParseWarnings({ errors }: { errors: readonly EnvParseError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border p-3 border-warning-line bg-warning-soft">
      <p className="text-xs font-medium text-warning">Parse warnings:</p>
      <ul className="mt-1 space-y-0.5">
        {errors.slice(0, 5).map((err) => (
          <li
            key={`${err.line}-${err.reason}`}
            className="text-xs text-warning"
          >
            Line {err.line}: {err.reason}
          </li>
        ))}
        {errors.length > 5 && (
          <li className="text-xs text-warning">
            ...and {errors.length - 5} more
          </li>
        )}
      </ul>
    </div>
  );
}

/** One parsed row in the preview, with its remove button. */
function EntryPreview({
  entry,
  masked,
  disabled,
  onRemove,
}: {
  entry: ParsedEnvEntry;
  masked: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const preview =
    entry.value.length > 40 ? entry.value.slice(0, 40) + "..." : entry.value;
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <span className="font-mono font-medium text-ink">{entry.key}</span>
        <span className="mx-1.5 text-ink-muted">=</span>
        <span className="truncate font-mono text-ink-muted">
          {masked ? "••••••••" : preview}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${entry.key}`}
        className="ml-2 shrink-0 rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** "12 variables parsed · 1 error" under the paste box. */
function ParseCounts({ entries, errors }: { entries: number; errors: number }) {
  return (
    <p className="mt-1 text-xs text-ink-muted">
      {entries} variable{entries !== 1 ? "s" : ""} parsed
      {errors > 0 && (
        <span className="text-warning">
          {" "}
          · {errors} error{errors !== 1 ? "s" : ""}
        </span>
      )}
    </p>
  );
}

/** Live progress while the entries are written one at a time. */
function SubmitProgressPanel({
  progress,
  proposing,
}: {
  progress: SubmitProgress;
  proposing: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 border-line bg-surface-raised">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-line" />
        <span className="text-sm text-ink-muted">
          {proposing ? "Proposing" : "Creating"} {progress.completed}/
          {progress.total}...
        </span>
      </div>
      {progress.failures.length > 0 && (
        <div className="mt-2 space-y-1">
          {progress.failures.map((f) => (
            <p key={f.key} className="text-xs text-danger">
              {f.key}: {f.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
