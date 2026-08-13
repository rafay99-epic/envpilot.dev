"use client";

import { useState, useEffect } from "react";
import {
  ENVIRONMENTS,
  type Environment,
  envToggleClasses,
} from "@/constants/project";
import { RotateCcw } from "lucide-react";
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

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
      }));
      setRotationEnabled(
        !!initialData.rotationFrequencyDays &&
          initialData.rotationFrequencyDays > 0
      );
    }
  }, [initialData]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^[0-9]/, "_");
    setFormData((prev) => ({ ...prev, key: value }));
  };

  const handleEnvironmentToggle = (env: Environment) => {
    setFormData((prev) => {
      const environments = prev.environments.includes(env)
        ? prev.environments.filter((e) => e !== env)
        : [...prev.environments, env];
      return { ...prev, environments };
    });
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

    if (formData.environments.length === 0) {
      setError("At least one environment is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger bg-danger-soft text-danger">
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
          className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 font-mono text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:cursor-not-allowed disabled:bg-surface-raised border-line bg-surface-raised text-ink placeholder-ink-subtle disabled:bg-surface"
        />
        {isEditing && (
          <p className="mt-1 text-xs text-ink-muted">
            Variable key cannot be changed after creation
          </p>
        )}
      </div>

      {/* Value field */}
      <div>
        <label
          htmlFor="value"
          className="block text-sm font-medium text-ink-muted"
        >
          Value {!isEditing && <span className="text-danger">*</span>}
          {isEditing && (
            <span className="text-ink-muted">(leave empty to keep current)</span>
          )}
        </label>
        <div className="relative mt-1">
          <input
            id="value"
            type={showValue ? "text" : "password"}
            value={formData.value}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, value: e.target.value }))
            }
            placeholder={
              isEditing ? "Enter new value or leave empty" : "postgres://..."
            }
            className="block w-full rounded-lg border border-line bg-white px-4 py-2 pr-10 font-mono text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
          />
          <button
            type="button"
            onClick={() => setShowValue((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink-muted"
          >
            {showValue ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

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
          className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
        />
      </div>

      {/* Environments */}
      <div>
        <label className="block text-sm font-medium text-ink-muted">
          Environments <span className="text-danger">*</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => handleEnvironmentToggle(env as Environment)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${envToggleClasses(env as Environment, formData.environments.includes(env as Environment))}`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {availableTags && availableTags.length > 0 && (
        <TagSelector
          availableTags={availableTags}
          selectedTagIds={formData.tagIds ?? []}
          onChange={(tagIds) => setFormData((prev) => ({ ...prev, tagIds }))}
          onCreateTag={onCreateTag}
        />
      )}
      {availableTags && availableTags.length === 0 && onCreateTag && (
        <TagSelector
          availableTags={[]}
          selectedTagIds={[]}
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

      {/* Rotation schedule (shown when feature is enabled for this org) */}
      {showRotation && (
        <div className="rounded-lg border border-line p-4 border-line">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={rotationEnabled}
              onChange={handleRotationToggle}
              className="h-4 w-4"
            />
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <RotateCcw className="h-4 w-4 text-ink-muted" />
              Enable rotation schedule
            </span>
          </label>
          {rotationEnabled && (
            <div className="mt-3 ml-7">
              <select
                value={formData.rotationFrequencyDays || 90}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    rotationFrequencyDays: Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-inverse focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink"
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
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-faint hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 text-ink-muted hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 bg-surface-raised text-ink-inverse hover:bg-surface-hover"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
