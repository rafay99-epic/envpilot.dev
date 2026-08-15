"use client";

import { useState, useRef, useEffect, useId } from "react";
import {
  ENVIRONMENTS,
  type Environment,
  envToggleClasses,
} from "@/constants/project";
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
}: BulkPasteFormProps) {
  const environmentsLabelId = useId();
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<ParsedEnvEntry[]>([]);
  const [errors, setErrors] = useState<EnvParseError[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([
    "development",
  ]);
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

  function handleEnvironmentToggle(env: Environment) {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  }

  function handleRemoveEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (entries.length === 0) {
      setSubmitError("No valid variables to create");
      return;
    }

    if (environments.length === 0) {
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
      environments,
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
          <p className="mt-1 text-xs text-ink-muted">
            {entries.length} variable{entries.length !== 1 ? "s" : ""} parsed
            {errors.length > 0 && (
              <span className="text-warning">
                {" "}
                · {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Parse errors */}
      {errors.length > 0 && (
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
      )}

      {/* Environments */}
      <div>
        <div
          id={environmentsLabelId}
          className="block text-sm font-medium text-ink-muted"
        >
          Environments <span className="text-danger">*</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          Applied to all variables
        </p>
        <div
          role="group"
          aria-labelledby={environmentsLabelId}
          className="mt-2 flex flex-wrap gap-2"
        >
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => handleEnvironmentToggle(env as Environment)}
              disabled={isSubmitting}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${envToggleClasses(env as Environment, environments.includes(env as Environment))}`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

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

      {/* Preview list */}
      {entries.length > 0 && (
        <div>
          <p className="block text-sm font-medium text-ink-muted">
            Preview ({entries.length})
          </p>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 border-line">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-medium text-ink">
                    {entry.key}
                  </span>
                  <span className="mx-1.5 text-ink-muted">=</span>
                  <span className="truncate font-mono text-ink-muted">
                    {isSensitive
                      ? "••••••••"
                      : entry.value.length > 40
                        ? entry.value.slice(0, 40) + "..."
                        : entry.value}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveEntry(entry.key)}
                  disabled={isSubmitting}
                  aria-label={`Remove ${entry.key}`}
                  className="ml-2 shrink-0 rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
                >
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="rounded-lg border p-3 border-line bg-surface-raised">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-line" />
            <span className="text-sm text-ink-muted">
              Creating {progress.completed}/{progress.total}...
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
            ? `Creating ${progress?.completed ?? 0}/${progress?.total ?? 0}...`
            : `${submitLabel} (${entries.length})`}
        </button>
      </div>
    </form>
  );
}
