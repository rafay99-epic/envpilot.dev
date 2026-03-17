import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

const RESERVED_SHORTCUTS = new Set([
  "Mod+L",
  "Mod+T",
  "Mod+W",
  "Mod+N",
  "Mod+Q",
  "Mod+R",
  "Mod+Shift+T",
  "Mod+Shift+N",
  "Mod+Shift+W",
  "Alt+F4",
]);

function normalizeBinding(binding: string): string {
  return binding
    .split("+")
    .map((k) => k.trim().toLowerCase())
    .sort()
    .join("+");
}

function normalizeForComparison(binding: string): string {
  if (binding.includes(" then ")) {
    return binding
      .split(" then ")
      .map((k) => k.trim().toLowerCase())
      .join(" then ");
  }
  return normalizeBinding(binding);
}

export function validateBinding(
  customBindings: Record<string, string>,
  editingId: string,
  newBinding: string
): { valid: boolean; conflictWith?: string; reason?: string } {
  // Check reserved browser shortcuts
  if (RESERVED_SHORTCUTS.has(newBinding)) {
    return {
      valid: false,
      reason: "This shortcut is reserved by the browser",
    };
  }

  const normalizedNew = normalizeForComparison(newBinding);

  // Check against all other shortcuts (defaults + custom overrides)
  for (const [id, def] of Object.entries(SHORTCUTS)) {
    if (id === editingId) continue;
    const effective = customBindings[id] ?? def.keys;
    if (normalizeForComparison(effective) === normalizedNew) {
      return {
        valid: false,
        conflictWith: id,
        reason: `Conflicts with "${def.description}"`,
      };
    }
  }

  return { valid: true };
}
