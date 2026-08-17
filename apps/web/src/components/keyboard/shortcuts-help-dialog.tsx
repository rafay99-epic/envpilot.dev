"use client";

import { useKeyboardStore } from "@/stores/keyboard-store";
import {
  getEffectiveShortcuts,
  type ShortcutDefinition,
} from "@/hooks/useKeyboardShortcuts";
import { Modal } from "@/components/ui/modal";

// A binding can repeat a key ("g then g"), so the token alone is not unique.
// The prefix up to and including this token is.
const prefixKey = (parts: string[], upTo: number, join: string) =>
  parts.slice(0, upTo + 1).join(join);

function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }) {
  const keys = shortcut.keys.split("+").map((k) => k.trim());
  const isSequence = shortcut.keys.includes(" then ");
  const segments = shortcut.keys.split(" then ");

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-ink-muted">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {isSequence
          ? segments.map((k, i) => (
              <span
                key={prefixKey(segments, i, " then ")}
                className="flex items-center gap-1"
              >
                {i > 0 && <span className="text-xs text-ink-faint">then</span>}
                <kbd className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                  {k.trim()}
                </kbd>
              </span>
            ))
          : keys.map((key, i) => (
              <span
                key={prefixKey(keys, i, "+")}
                className="flex items-center gap-1"
              >
                {i > 0 && <span className="text-xs text-ink-faint">+</span>}
                <kbd className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink-muted">
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {category.label}
              </h3>
              <div className="divide-y divide-line">
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
