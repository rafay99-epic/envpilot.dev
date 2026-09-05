"use client";

import { useId, type ReactNode } from "react";
import { envToggleClasses, type Environment } from "@/constants/project";
import { protectionState, spansProtection } from "./selection";

/** Names the testids the e2e suite locates the notes by. */
type TestIdPrefix = "variable" | "bulk" | "account" | "file";

interface ProtectionNoteProps {
  selected: readonly string[];
  /** The resource's stored environments; the server checks the union. */
  existingEnvironments?: readonly string[];
  protectedEnvironments?: readonly string[];
  testIdPrefix: TestIdPrefix;
  /** Second sentence of the note. */
  noteSuffix?: string;
}

/**
 * "production is protected. A second person applies this change." Rendered
 * by the picker, and on its own by the file drawer's replace-contents mode,
 * which hides the picker but still files a proposal.
 */
export function ProtectionNote({
  selected,
  existingEnvironments,
  protectedEnvironments,
  testIdPrefix,
  noteSuffix = "A second person applies this change.",
}: ProtectionNoteProps) {
  const { protectedSelected, proposing } = protectionState(
    selected,
    existingEnvironments,
    protectedEnvironments
  );
  if (!proposing) return null;
  return (
    <p
      data-testid={`${testIdPrefix}-protected-note`}
      className="mt-1.5 text-xs text-warning"
    >
      {protectedSelected.join(", ")}{" "}
      {protectedSelected.length > 1 ? "are" : "is"} protected. {noteSuffix}
    </p>
  );
}

interface EnvironmentPickerProps {
  /** Buttons to render, from `resolveEnvironments`. */
  allowedEnvironments: readonly Environment[];
  /** Options that cannot be toggled: stored, but outside the write scope. */
  lockedEnvironments?: ReadonlySet<string>;
  selected: readonly string[];
  onToggle: (env: Environment) => void;
  /** Environments this project protects. */
  protectedEnvironments?: readonly string[];
  /** The resource's stored environments; the server checks the union. */
  existingEnvironments?: readonly string[];
  disabled?: boolean;
  testIdPrefix: TestIdPrefix;
  /** Second sentence of the protected note. */
  noteSuffix?: string;
  /** Variables only: warn when one row spans protected and unprotected. */
  warnOnSpan?: boolean;
  /** Sits between the label and the buttons. */
  description?: string;
  /** Sits under the buttons, above the notes. */
  hint?: ReactNode;
}

/**
 * The environment toggle group shared by every resource form, with the
 * protection notes that depend on the selection. One definition, because
 * four hand-copied groups drift the moment any one of them is touched.
 */
export function EnvironmentPicker({
  allowedEnvironments,
  lockedEnvironments,
  selected,
  onToggle,
  protectedEnvironments,
  existingEnvironments,
  disabled = false,
  testIdPrefix,
  noteSuffix,
  warnOnSpan = false,
  description,
  hint,
}: EnvironmentPickerProps) {
  const labelId = useId();
  const selectedSet = new Set(selected);

  return (
    <div>
      {/* A span, not a <label>: this names the toggle group, not one input. */}
      <span id={labelId} className="block text-sm font-medium text-ink-muted">
        Environments <span className="text-danger">*</span>
      </span>
      {description && (
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      )}
      <div
        role="group"
        aria-labelledby={labelId}
        className="mt-2 flex flex-wrap gap-2"
      >
        {allowedEnvironments.map((env) => {
          const locked = lockedEnvironments?.has(env) ?? false;
          const isSelected = selectedSet.has(env);
          return (
            <button
              key={env}
              type="button"
              onClick={() => onToggle(env)}
              disabled={disabled || locked}
              aria-pressed={isSelected}
              title={
                locked
                  ? "Outside your environment scope. Kept as it is."
                  : undefined
              }
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${envToggleClasses(env, isSelected)} ${locked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {env}
            </button>
          );
        })}
      </div>
      {hint}
      <ProtectionNote
        selected={selected}
        existingEnvironments={existingEnvironments}
        protectedEnvironments={protectedEnvironments}
        testIdPrefix={testIdPrefix}
        noteSuffix={noteSuffix}
      />
      {warnOnSpan && spansProtection(selected, protectedEnvironments) && (
        <p
          data-testid={`${testIdPrefix}-spanning-warning`}
          className="mt-1.5 text-xs text-ink-subtle"
        >
          Developers scoped to development will not see this variable. Keep one
          row per environment for secrets.
        </p>
      )}
    </div>
  );
}
