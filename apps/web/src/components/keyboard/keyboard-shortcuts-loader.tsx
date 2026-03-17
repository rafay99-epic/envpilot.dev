"use client";

import { useEffect } from "react";
import { useKeyboardStore } from "@/stores/keyboard-store";

export function KeyboardShortcutsLoader() {
  const isBindingsLoaded = useKeyboardStore((s) => s.isBindingsLoaded);
  const setCustomBindings = useKeyboardStore((s) => s.setCustomBindings);

  useEffect(() => {
    if (isBindingsLoaded) return;

    async function fetchBindings() {
      try {
        const res = await fetch("/api/users/me/preferences");
        if (res.ok) {
          const data = await res.json();
          setCustomBindings(data.keyboardShortcuts ?? {});
        } else {
          setCustomBindings({});
        }
      } catch {
        setCustomBindings({});
      }
    }
    fetchBindings();
  }, [isBindingsLoaded, setCustomBindings]);

  return null;
}
