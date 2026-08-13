"use client";

import { useState } from "react";
import { Pencil, RotateCcw, X } from "lucide-react";
import { SettingsSection } from "@envpilot/ui";
import { TerminalButton } from "@/components/dashboard/terminal-ui";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { getEffectiveShortcuts } from "@/hooks/useKeyboardShortcuts";
import { validateBinding } from "@/lib/shortcut-validation";

const shortcutCategories = [
  { key: "navigation" as const, label: "Navigation" },
  { key: "actions" as const, label: "Actions" },
  { key: "selection" as const, label: "Selection" },
];

export function CustomizationSettings() {
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const updateBinding = useKeyboardStore((s) => s.updateBinding);
  const removeBinding = useKeyboardStore((s) => s.removeBinding);
  const resetAllBindings = useKeyboardStore((s) => s.resetAllBindings);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [isRecordingSequence, setIsRecordingSequence] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const effectiveShortcuts = getEffectiveShortcuts(customBindings);
  const hasCustomBindings = Object.keys(customBindings).length > 0;

  function startEditing(shortcutId: string) {
    setEditingId(shortcutId);
    setRecordedKeys([]);
    setIsRecordingSequence(false);
    setSequenceStep(0);
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setRecordedKeys([]);
    setIsRecordingSequence(false);
    setSequenceStep(0);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!editingId) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    if (key === "Escape") {
      cancelEditing();
      return;
    }

    // Ignore standalone modifier keys
    if (["Control", "Shift", "Alt", "Meta"].includes(key)) return;

    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("Mod");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    parts.push(key.length === 1 ? key.toUpperCase() : key);

    const binding = parts.join("+");

    if (isRecordingSequence && sequenceStep === 1) {
      // Second key of sequence
      const fullBinding = `${recordedKeys[0]} then ${binding}`;
      const validation = validateBinding(
        customBindings,
        editingId,
        fullBinding
      );
      if (!validation.valid) {
        setError(validation.reason ?? "Invalid binding");
        return;
      }
      saveBinding(editingId, fullBinding);
      return;
    }

    // Single key press — check if it's a simple letter (potential sequence start)
    if (
      parts.length === 1 &&
      key.length === 1 &&
      /^[A-Z]$/i.test(key) &&
      !isRecordingSequence
    ) {
      // Start sequence recording
      setIsRecordingSequence(true);
      setSequenceStep(1);
      setRecordedKeys([binding]);
      return;
    }

    // Regular single shortcut
    const validation = validateBinding(customBindings, editingId, binding);
    if (!validation.valid) {
      setError(validation.reason ?? "Invalid binding");
      return;
    }
    saveBinding(editingId, binding);
  }

  async function saveBinding(shortcutId: string, binding: string) {
    setIsSaving(true);
    const newBindings = { ...customBindings, [shortcutId]: binding };
    updateBinding(shortcutId, binding);

    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: newBindings }),
      });
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      // Revert on error
      removeBinding(shortcutId);
    } finally {
      setIsSaving(false);
      setEditingId(null);
      setRecordedKeys([]);
      setIsRecordingSequence(false);
      setSequenceStep(0);
      setError(null);
    }
  }

  async function handleRemoveBinding(shortcutId: string) {
    removeBinding(shortcutId);
    const { [shortcutId]: _, ...rest } = customBindings;
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: rest }),
      });
    } catch {
      // Revert
      updateBinding(shortcutId, customBindings[shortcutId]);
    }
  }

  async function handleResetAll() {
    resetAllBindings();
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: {} }),
      });
      setSaveMessage("All shortcuts reset to defaults");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      // Silently fail
    }
  }

  return (
    <div>
      <SettingsSection
        title="Keyboard shortcuts"
        description="Customize shortcuts to match your workflow. Click the pencil to edit one, then press a key combination, or a single letter followed by another key for a sequence (e.g. G then P). Press Esc to cancel. Shortcuts sync across your devices."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {hasCustomBindings && (
              <TerminalButton
                variant="secondary"
                onClick={handleResetAll}
                disabled={isSaving}
              >
                <RotateCcw className="h-3 w-3" />
                Reset all
              </TerminalButton>
            )}
            {saveMessage && (
              <span className="text-[12px] text-accent">{saveMessage}</span>
            )}
          </div>
        }
      >
        {shortcutCategories.map((category) => {
          const items = Object.entries(effectiveShortcuts).filter(
            ([, def]) => def.category === category.key
          );
          if (items.length === 0) return null;

          return (
            <div key={category.key}>
              <h3 className="mb-1 font-mono text-[12px] tracking-wider text-ink-subtle uppercase">
                {category.label}
              </h3>
              <ul>
                {items.map(([id, def]) => {
                  const isEditing = editingId === id;
                  const isCustomized = id in customBindings;

                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-4 border-t border-line py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-[14px] text-ink-muted">
                          {def.description}
                        </span>
                        {isCustomized && !isEditing && (
                          <span className="font-mono text-[11px] text-premium">
                            custom
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-2"
                            onKeyDown={handleKeyDown}
                            tabIndex={0}
                            autoFocus
                          >
                            <span className="rounded-panel border border-premium-line bg-surface px-3 py-1.5">
                              {isRecordingSequence && sequenceStep === 1 ? (
                                <span className="font-mono text-xs text-warning">
                                  {recordedKeys[0]} then ...
                                </span>
                              ) : (
                                <span className="font-mono text-xs text-ink-subtle">
                                  Press keys...
                                </span>
                              )}
                            </span>
                            {error && (
                              <span className="text-xs text-danger">
                                {error}
                              </span>
                            )}
                            <button
                              onClick={cancelEditing}
                              title="Cancel"
                              className="rounded p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <ShortcutKeyDisplay keys={def.keys} />
                            <button
                              onClick={() => startEditing(id)}
                              className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink-muted"
                              title="Edit shortcut"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {isCustomized && (
                              <button
                                onClick={() => handleRemoveBinding(id)}
                                className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-hover hover:text-warning"
                                title="Reset to default"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </SettingsSection>
    </div>
  );
}

function ShortcutKeyDisplay({ keys }: { keys: string }) {
  const isSequence = keys.includes(" then ");

  if (isSequence) {
    return (
      <div className="flex items-center gap-1">
        {keys.split(" then ").map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-ink-faint">then</span>}
            <kbd className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink-muted">
              {k.trim()}
            </kbd>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {keys.split("+").map((key, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-ink-faint">+</span>}
          <kbd className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink-muted">
            {key.trim() === "Mod"
              ? typeof navigator !== "undefined" &&
                /Mac/.test(navigator.userAgent)
                ? "⌘"
                : "Ctrl"
              : key.trim() === "Shift"
                ? "⇧"
                : key.trim()}
          </kbd>
        </span>
      ))}
    </div>
  );
}
