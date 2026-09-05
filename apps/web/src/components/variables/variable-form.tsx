"use client";

import { useState } from "react";
import { ENVIRONMENTS, type Environment } from "@/constants/project";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { EnvironmentPicker } from "@/components/environments/environment-picker";
import {
  protectionState,
  resolveEnvironments,
} from "@/components/environments/selection";
import type { Tag } from "@/hooks/useTags";
import { TagSelector } from "./tag-selector";

export interface VariableFormData {
  key: string;
  value: string;
  description: string;
  environments: Environment[];
  isSensitive: boolean;
  rotationFrequencyDays?: number;
  tagIds?: string[];
}

interface VariableFormProps {
  initialData?: Partial<VariableFormData>;
  onSubmit: (data: VariableFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  isEditing?: boolean;
  showRotation?: boolean;
  availableTags?: Tag[];
  onCreateTag?: (name: string, color: string) => Promise<void>;
  /** Environments this project protects; selecting one turns save into a proposal. */
  protectedEnvironments?: readonly string[];
  /** Environments the caller may write to. Defaults to all of them. */
  allowedEnvironments?: readonly string[];
}

const ROTATION_PRESETS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

const defaultFormData: VariableFormData = {
  key: "",
  value: "",
  description: "",
  environments: ["development"],
  isSensitive: false,
};

export function VariableForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  isEditing = false,
  showRotation = false,
  availableTags,
  onCreateTag,
  protectedEnvironments,
  allowedEnvironments = ENVIRONMENTS,
}: VariableFormProps) {
  const [formData, setFormData] = useState<VariableFormData>(() => ({
    ...defaultFormData,
    ...initialData,
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValue, setShowValue] = useState(!initialData?.isSensitive);
  const [rotationEnabled, setRotationEnabled] = useState(
    () =>
      !!initialData?.rotationFrequencyDays &&
      initialData.rotationFrequencyDays > 0
  );

  const { options, locked, selected } = resolveEnvironments(
    formData.environments,
    allowedEnvironments,
    initialData?.environments
  );
  const { proposing } = protectionState(
    selected,
    initialData?.environments,
    protectedEnvironments
  );

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^[0-9]/, "_");
    setFormData((prev) => ({ ...prev, key: value }));
  };

  // Toggling works off the resolved selection, never off raw state: a scope
  // that narrowed after mount must not resurrect an environment the caller
  // can no longer write to.
  const handleEnvironmentToggle = (env: Environment) => {
    setFormData((prev) => ({
      ...prev,
      environments: selected.includes(env)
        ? selected.filter((e) => e !== env)
        : [...selected, env],
    }));
  };

  const handleRotationToggle = () => {
    if (rotationEnabled) {
      setRotationEnabled(false);
      setFormData((prev) => ({ ...prev, rotationFrequencyDays: 0 }));
    } else {
      setRotationEnabled(true);
      setFormData((prev) => ({
        ...prev,
        rotationFrequencyDays: prev.rotationFrequencyDays || 90,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.key.trim()) {
      setError("Key is required");
      return;
    }

    if (!formData.value.trim() && !isEditing) {
      setError("Value is required");
      return;
    }

    if (selected.length === 0) {
      setError("At least one environment is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ ...formData, environments: selected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg p-3 text-sm bg-danger-soft text-danger">
          {error}
        </div>
      )}

      {/* Key field */}
      <div>
        <label
          htmlFor="key"
          className="block text-sm font-medium text-ink-muted"
        >
          Key <span className="text-danger">*</span>
        </label>
        <input
          id="key"
          type="text"
          value={formData.key}
          onChange={handleKeyChange}
          disabled={isEditing}
          placeholder="DATABASE_URL"
          className="mt-1 block w-full rounded-lg border px-4 py-2 font-mono text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:cursor-not-allowed sm:text-sm border-line bg-surface-raised text-ink placeholder-ink-subtle disabled:bg-surface"
        />
        {isEditing && (
          <p className="mt-1 text-xs text-ink-muted">
            Variable key cannot be changed after creation
          </p>
        )}
      </div>

      <SecretValueField
        value={formData.value}
        isEditing={isEditing}
        showValue={showValue}
        onToggleShow={() => setShowValue((prev) => !prev)}
        onChange={(value) => setFormData((prev) => ({ ...prev, value }))}
      />

      {/* Description field */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink-muted"
        >
          Description <span className="text-ink-muted">(optional)</span>
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Brief description of what this variable is used for..."
          rows={2}
          className="mt-1 block w-full rounded-lg border px-4 py-2 text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line bg-surface-raised text-ink placeholder-ink-subtle"
        />
      </div>

      <EnvironmentPicker
        allowedEnvironments={options}
        lockedEnvironments={locked}
        selected={selected}
        onToggle={handleEnvironmentToggle}
        protectedEnvironments={protectedEnvironments}
        existingEnvironments={initialData?.environments}
        testIdPrefix="variable"
        warnOnSpan
      />

      {/* Tags: rendered when there are tags to pick, or a way to make one */}
      {availableTags && (availableTags.length > 0 || onCreateTag) && (
        <TagSelector
          availableTags={availableTags}
          selectedTagIds={formData.tagIds ?? []}
          onChange={(tagIds) => setFormData((prev) => ({ ...prev, tagIds }))}
          onCreateTag={onCreateTag}
        />
      )}

      {/* Sensitive toggle */}
      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={formData.isSensitive}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                isSensitive: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
          <span className="text-sm text-ink-muted">
            Mark as sensitive{" "}
            <span className="text-ink-muted">(masks value by default)</span>
          </span>
        </label>
      </div>

      {/* Rotation schedule (shown when the feature is enabled for this org) */}
      {showRotation && (
        <RotationSchedule
          enabled={rotationEnabled}
          frequencyDays={formData.rotationFrequencyDays}
          onToggle={handleRotationToggle}
          onChangeDays={(rotationFrequencyDays) =>
            setFormData((prev) => ({ ...prev, rotationFrequencyDays }))
          }
        />
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
          data-testid="variable-submit"
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
        >
          {isSubmitting
            ? "Saving..."
            : proposing
              ? "Propose change"
              : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * The value input and its reveal toggle. Its own component so the form body
 * stays about the variable rather than about masking one field.
 */
function SecretValueField({
  value,
  isEditing,
  showValue,
  onToggleShow,
  onChange,
}: {
  value: string;
  isEditing: boolean;
  showValue: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor="value"
        className="block text-sm font-medium text-ink-muted"
      >
        Value{" "}
        {isEditing ? (
          <span className="text-ink-muted">(leave empty to keep current)</span>
        ) : (
          <span className="text-danger">*</span>
        )}
      </label>
      <div className="relative mt-1">
        <input
          id="value"
          type={showValue ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isEditing ? "Enter new value or leave empty" : "postgres://..."
          }
          className="block w-full rounded-lg border px-4 py-2 pr-10 font-mono text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line bg-surface-raised text-ink placeholder-ink-subtle"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={showValue ? "Hide value" : "Show value"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink-muted"
        >
          {showValue ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}

/** The rotation reminder schedule, shown when the org has the feature. */
function RotationSchedule({
  enabled,
  frequencyDays,
  onToggle,
  onChangeDays,
}: {
  enabled: boolean;
  frequencyDays?: number;
  onToggle: () => void;
  onChangeDays: (days: number) => void;
}) {
  return (
    <div className="rounded-lg border p-4 border-line">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="h-4 w-4"
        />
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <RotateCcw className="h-4 w-4 text-ink-muted" />
          Enable rotation schedule
        </span>
      </label>
      {enabled && (
        <div className="mt-3 ml-7">
          <select
            value={frequencyDays || 90}
            onChange={(e) => onChangeDays(Number(e.target.value))}
            aria-label="Rotation frequency"
            className="rounded-lg border px-3 py-1.5 text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line bg-surface-raised text-ink"
          >
            {ROTATION_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                Every {preset.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-subtle">
            You&apos;ll receive reminders before the secret expires.
          </p>
        </div>
      )}
    </div>
  );
}
