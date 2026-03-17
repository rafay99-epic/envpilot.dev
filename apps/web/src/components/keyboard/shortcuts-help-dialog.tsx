"use client";

import { useKeyboardStore } from "@/stores/keyboard-store";
import {
  getEffectiveShortcuts,
  type ShortcutDefinition,
} from "@/hooks/useKeyboardShortcuts";
import { Modal } from "@/components/ui/modal";

function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }) {
  const keys = shortcut.keys.split("+").map((k) => k.trim());
  const isSequence = shortcut.keys.includes(" then ");

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-zinc-300">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {isSequence
          ? shortcut.keys.split(" then ").map((k, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-xs text-zinc-600">then</span>}
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
                  {k.trim()}
                </kbd>
              </span>
            ))
          : keys.map((key, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-xs text-zinc-600">+</span>}
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
                  {key === "Mod"
                    ? typeof navigator !== "undefined" &&
                      /Mac/.test(navigator.userAgent)
                      ? "\u2318"
                      : "Ctrl"
                    : key === "Shift"
                      ? "\u21E7"
                      : key}
                </kbd>
              </span>
            ))}
      </div>
    </div>
  );
}

const categories = [
  { key: "navigation" as const, label: "Navigation" },
  { key: "actions" as const, label: "Actions" },
  { key: "selection" as const, label: "Selection" },
];

export function ShortcutsHelpDialog() {
  const isOpen = useKeyboardStore((s) => s.isHelpDialogOpen);
  const closeHelpDialog = useKeyboardStore((s) => s.closeHelpDialog);
  const customBindings = useKeyboardStore((s) => s.customBindings);

  const effectiveShortcuts = getEffectiveShortcuts(customBindings);
  const shortcutEntries = Object.values(effectiveShortcuts);

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeHelpDialog}
      title="Keyboard Shortcuts"
      size="md"
    >
      <div className="space-y-4">
        {categories.map((category) => {
          const items = shortcutEntries.filter(
            (s) => s.category === category.key
          );
          if (items.length === 0) return null;
          return (
            <div key={category.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {category.label}
              </h3>
              <div className="divide-y divide-zinc-800/50">
                {items.map((shortcut) => (
                  <ShortcutRow key={shortcut.description} shortcut={shortcut} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
