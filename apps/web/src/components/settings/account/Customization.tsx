"use client";

import { useReducer, useState } from "react";
import { Pencil, RotateCcw, X } from "lucide-react";
import { SettingsSection } from "@envpilot/ui";
import { TerminalButton } from "@/components/dashboard/terminal-ui";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { getEffectiveShortcuts } from "@/hooks/useKeyboardShortcuts";
import { validateBinding } from "@/lib/shortcut-validation";
import { useSavePreferences } from "@/hooks/usePreferences";
import { createLogger } from "@/lib/logger";
import {
  initialShortcutRecorderState,
  shortcutRecorderReducer,
} from "./shortcut-recorder-state";

const log = createLogger("settings/customization");

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
  const savePreferences = useSavePreferences();

  const [recorder, dispatch] = useReducer(
    shortcutRecorderReducer,
    initialShortcutRecorderState
  );
  // A transient confirmation, also raised by "Reset all" on its own — not part
  // of the recorder's lifecycle.
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const effectiveShortcuts = getEffectiveShortcuts(customBindings);
  const hasCustomBindings = Object.keys(customBindings).length > 0;

  function startEditing(shortcutId: string) {
    dispatch({ kind: "editing-started", shortcutId });
  }

  function cancelEditing() {
    dispatch({ kind: "editing-cancelled" });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const editingId = recorder.editingId;
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

    if (recorder.isRecordingSequence && recorder.sequenceStep === 1) {
      // Second key of sequence
      const fullBinding = `${recorder.recordedKeys[0]} then ${binding}`;
      const validation = validateBinding(
        customBindings,
        editingId,
        fullBinding
      );
      if (!validation.valid) {
        dispatch({
          kind: "binding-rejected",
          error: validation.reason ?? "Invalid binding",
        });
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
      !recorder.isRecordingSequence
    ) {
      dispatch({ kind: "sequence-started", firstKey: binding });
      return;
    }

    // Regular single shortcut
    const validation = validateBinding(customBindings, editingId, binding);
    if (!validation.valid) {
      dispatch({
        kind: "binding-rejected",
        error: validation.reason ?? "Invalid binding",
      });
      return;
    }
    saveBinding(editingId, binding);
  }

  async function saveBinding(shortcutId: string, binding: string) {
    dispatch({ kind: "save-started" });
    const newBindings = { ...customBindings, [shortcutId]: binding };
    updateBinding(shortcutId, binding);

    try {
      await savePreferences({ keyboardShortcuts: newBindings });
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      log.error("shortcut_save_failed", { shortcutId, binding }, err);
      // Revert on error
      removeBinding(shortcutId);
    }
    // Closed after the try/catch rather than in a finally block: the catch
    // swallows and neither path returns early, so this runs either way, and
    // React Compiler bails on any function whose try has a finalizer.
    dispatch({ kind: "save-settled" });
  }

  async function handleRemoveBinding(shortcutId: string) {
    removeBinding(shortcutId);
    const { [shortcutId]: _, ...rest } = customBindings;
    try {
      await savePreferences({ keyboardShortcuts: rest });
    } catch (err) {
      log.error("shortcut_remove_failed", { shortcutId }, err);
      // Revert
      updateBinding(shortcutId, customBindings[shortcutId]);
    }
  }

  async function handleResetAll() {
    resetAllBindings();
    try {
      await savePreferences({ keyboardShortcuts: {} });
      setSaveMessage("All shortcuts reset to defaults");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      // Was "silently fail". A reset that does not persist looks identical to
      // one that did until the next reload.
      log.error("shortcut_reset_all_failed", {}, err);
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
                disabled={recorder.isSaving}
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
                  const isEditing = recorder.editingId === id;
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
                          // A key-capture surface, not a button: a button
                          // would swallow Enter and Space, which are both
                          // bindable. `textbox` is the closest role for a
                          // focusable control that takes keystrokes, and
                          // aria-readonly says the keys are captured rather
                          // than typed into it.
                          <div
                            className="flex items-center gap-2"
                            onKeyDown={handleKeyDown}
                            tabIndex={0}
                            autoFocus
                            role="textbox"
                            aria-readonly
                            aria-label={`Recording a shortcut for ${def.description}. Press a key combination, or Escape to cancel.`}
                          >
                            <span className="rounded-panel border border-premium-line bg-surface px-3 py-1.5">
                              {recorder.isRecordingSequence &&
                              recorder.sequenceStep === 1 ? (
                                <span className="font-mono text-xs text-warning">
                                  {recorder.recordedKeys[0]} then ...
                                </span>
                              ) : (
                                <span className="font-mono text-xs text-ink-subtle">
                                  Press keys...
                                </span>
                              )}
                            </span>
                            {recorder.error && (
                              <span className="text-xs text-danger">
                                {recorder.error}
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

// A binding can repeat a key ("g then g"), so the token alone is not unique.
// The prefix up to and including this token is.
const prefixKey = (parts: string[], upTo: number, join: string) =>
  parts.slice(0, upTo + 1).join(join);

function ShortcutKeyDisplay({ keys }: { keys: string }) {
  const isSequence = keys.includes(" then ");
  const segments = keys.split(" then ");
  const chord = keys.split("+");

  if (isSequence) {
    return (
      <div className="flex items-center gap-1">
        {segments.map((k, i) => (
          <span
            key={prefixKey(segments, i, " then ")}
            className="flex items-center gap-1"
          >
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
      {chord.map((key, i) => (
        <span
          key={prefixKey(chord, i, "+")}
          className="flex items-center gap-1"
        >
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
