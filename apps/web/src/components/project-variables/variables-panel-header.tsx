"use client";

import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, parseBinding } from "@/hooks/useKeyboardShortcuts";
import { useIsMacPlatform } from "@/hooks/useIsMacPlatform";

// Variables panel title row: result count plus Export / Import / Add actions.
export function VariablesPanelHeader({
  count,
  isSearching,
  searchTerm,
  truncated,
  selectedEnvironment,
  canCreateVariable,
  canAddVariable,
  onExport,
  onImport,
  onCreate,
}: {
  count: number;
  isSearching: boolean;
  searchTerm: string;
  truncated: boolean | undefined;
  selectedEnvironment: string;
  canCreateVariable: boolean;
  canAddVariable: boolean;
  onExport: () => void;
  onImport: () => void;
  onCreate: () => void;
}) {
  // Keyboard shortcut: Cmd/Ctrl+Shift+K to open Add Variable drawer (respects custom bindings)
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const addVarKeys = customBindings.ADD_VARIABLE ?? SHORTCUTS.ADD_VARIABLE.keys;
  const addVarBinding = parseBinding(addVarKeys);

  useHotkey(
    addVarBinding.type === "single"
      ? (addVarBinding.hotkey as Hotkey)
      : ("F24" as Hotkey),
    (e) => {
      e.preventDefault();
      if (canAddVariable) {
        onCreate();
      }
    },
    { enabled: addVarBinding.type === "single" }
  );

  useHotkeySequence(
    addVarBinding.type === "sequence"
      ? (addVarBinding.keys as unknown as HotkeySequence)
      : (["Unidentified", "Unidentified"] as unknown as HotkeySequence),
    () => {
      if (canAddVariable) {
        onCreate();
      }
    },
    addVarBinding.type === "sequence"
      ? { enabled: true }
      : { enabled: false, conflictBehavior: "allow" }
  );

  // Server render and hydration both read the Ctrl label, then React swaps in
  // the real platform as part of the hydration commit. An effect would do the
  // same swap one paint later, which every Mac user would see.
  const isMacPlatform = useIsMacPlatform();

  return (
    <div className="flex items-center justify-between border-b px-6 py-4 border-line">
      <div>
        <h2 className="font-semibold text-ink">Environment Variables</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {count}
          {isSearching ? " result" : " variable"}
          {count !== 1 ? "s" : ""}
          {isSearching
            ? ` for "${searchTerm}"`
            : selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
        </p>
        {isSearching && truncated && (
          <p className="mt-1 text-xs text-warning">
            Showing the first 100 matches — narrow your search to see more.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export
        </button>

        {canCreateVariable && (
          <button
            onClick={onImport}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import
          </button>
        )}

        {canAddVariable && (
          <button
            onClick={onCreate}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium transition-colors text-ink-inverse hover:bg-ink-muted"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            {canCreateVariable ? "Add Variable" : "Request Variable"}
            <kbd className="ml-1.5 hidden rounded bg-white/20 px-1.5 py-0.5 text-xs font-normal sm:inline-block">
              {isMacPlatform ? "⌘⇧K" : "Ctrl+Shift+K"}
            </kbd>
          </button>
        )}
      </div>
    </div>
  );
}
