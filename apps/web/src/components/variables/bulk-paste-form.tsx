"use client";

import { useState, useRef, useEffect } from "react";
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
  availableTags = [],
  onCreateTag,
}: BulkPasteFormProps) {
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
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {submitError}
        </div>
      )}

      {/* Textarea */}
      <div>
        <label
          htmlFor="env-paste"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
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
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          disabled={isSubmitting}
        />
        {rawText.trim() && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {entries.length} variable{entries.length !== 1 ? "s" : ""} parsed
            {errors.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                · {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Parse errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Parse warnings:
          </p>
          <ul className="mt-1 space-y-0.5">
            {errors.slice(0, 5).map((err, i) => (
              <li
                key={i}
                className="text-xs text-amber-600 dark:text-amber-400"
              >
                Line {err.line}: {err.reason}
              </li>
            ))}
            {errors.length > 5 && (
              <li className="text-xs text-amber-600 dark:text-amber-400">
                ...and {errors.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Environments */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Environments <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Applied to all variables
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => handleEnvironmentToggle(env as Environment)}
              disabled={isSubmitting}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                environments.includes(env as Environment)
                  ? env === "production"
                    ? "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700"
                    : env === "staging"
                      ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-700"
                      : "bg-green-100 text-green-700 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
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
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Mark all as sensitive{" "}
            <span className="text-zinc-400">(masks values by default)</span>
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
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Preview ({entries.length})
          </label>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.key}
                  </span>
                  <span className="mx-1.5 text-zinc-400">=</span>
                  <span className="truncate font-mono text-zinc-500 dark:text-zinc-400">
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
                  className="ml-2 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                >
                  <svg
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
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Creating {progress.completed}/{progress.total}...
            </span>
          </div>
          {progress.failures.length > 0 && (
            <div className="mt-2 space-y-1">
              {progress.failures.map((f, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
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
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || entries.length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isSubmitting
            ? `Creating ${progress?.completed ?? 0}/${progress?.total ?? 0}...`
            : `${submitLabel} (${entries.length})`}
        </button>
      </div>
    </form>
  );
}
