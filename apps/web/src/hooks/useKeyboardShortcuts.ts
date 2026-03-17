"use client";

import { useRouter } from "next/navigation";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { useKeyboardStore } from "@/stores/keyboard-store";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";

export interface ShortcutDefinition {
  keys: string;
  description: string;
  category: "navigation" | "actions" | "selection";
}

export const SHORTCUTS: Record<string, ShortcutDefinition> = {
  COMMAND_PALETTE: {
    keys: "Mod+K",
    description: "Open command palette",
    category: "actions",
  },
  ADD_VARIABLE: {
    keys: "Mod+Shift+K",
    description: "Add variable",
    category: "actions",
  },
  NAV_PROJECTS: {
    keys: "G then P",
    description: "Go to projects",
    category: "navigation",
  },
  NAV_VARIABLES: {
    keys: "G then V",
    description: "Go to variables",
    category: "navigation",
  },
  NAV_AUDIT: {
    keys: "G then A",
    description: "Go to audit logs",
    category: "navigation",
  },
  NAV_SETTINGS: {
    keys: "G then S",
    description: "Go to settings",
    category: "navigation",
  },
  NAV_TEAM: {
    keys: "G then T",
    description: "Go to team",
    category: "navigation",
  },
  HELP: {
    keys: "Shift+?",
    description: "Show keyboard shortcuts",
    category: "actions",
  },
  SEARCH: {
    keys: "/",
    description: "Focus search",
    category: "actions",
  },
  SELECT_ALL: {
    keys: "Mod+A",
    description: "Select all variables",
    category: "selection",
  },
} as const;

type ParsedBinding =
  | { type: "single"; hotkey: string }
  | { type: "sequence"; keys: string[] };

export function parseBinding(keys: string): ParsedBinding {
  if (keys.includes(" then ")) {
    return {
      type: "sequence",
      keys: keys.split(" then ").map((k) => k.trim()),
    };
  }
  return { type: "single", hotkey: keys };
}

export function getEffectiveShortcuts(
  customBindings: Record<string, string>
): Record<string, ShortcutDefinition> {
  const result: Record<string, ShortcutDefinition> = {};
  for (const [id, def] of Object.entries(SHORTCUTS)) {
    result[id] = {
      ...def,
      keys: customBindings[id] ?? def.keys,
    };
  }
  return result;
}

// Dummy values that will never match real keypresses
const DEAD_SEQUENCE: HotkeySequence = [
  "Unidentified",
  "Unidentified",
] as unknown as HotkeySequence;
const DEAD_HOTKEY = "F24" as Hotkey;

function useShortcut(
  shortcutId: string,
  callback: (e: KeyboardEvent) => void,
  isEnabled: boolean,
  customBindings: Record<string, string>
) {
  const keys = customBindings[shortcutId] ?? SHORTCUTS[shortcutId].keys;
  const binding = parseBinding(keys);

  useHotkeySequence(
    binding.type === "sequence"
      ? (binding.keys as unknown as HotkeySequence)
      : DEAD_SEQUENCE,
    callback,
    { enabled: isEnabled && binding.type === "sequence" }
  );

  useHotkey(
    binding.type === "single" ? (binding.hotkey as Hotkey) : DEAD_HOTKEY,
    (e) => {
      e.preventDefault();
      callback(e);
    },
    { enabled: isEnabled && binding.type === "single" }
  );
}

export function useGlobalNavShortcuts() {
  const router = useRouter();
  const isEnabled = useKeyboardStore((s) => s.isShortcutsEnabled);
  const customBindings = useKeyboardStore((s) => s.customBindings);

  useShortcut(
    "NAV_PROJECTS",
    () => router.push("/dashboard/projects"),
    isEnabled,
    customBindings
  );

  useShortcut(
    "NAV_VARIABLES",
    () => router.push("/dashboard/variables"),
    isEnabled,
    customBindings
  );

  useShortcut(
    "NAV_AUDIT",
    () => router.push("/dashboard/audit"),
    isEnabled,
    customBindings
  );

  useShortcut(
    "NAV_SETTINGS",
    () => router.push("/dashboard/settings"),
    isEnabled,
    customBindings
  );

  useShortcut(
    "NAV_TEAM",
    () => router.push("/dashboard/team"),
    isEnabled,
    customBindings
  );

  useShortcut(
    "HELP",
    () => useKeyboardStore.getState().openHelpDialog(),
    isEnabled,
    customBindings
  );
}
