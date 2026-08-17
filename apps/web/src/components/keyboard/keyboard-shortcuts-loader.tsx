"use client";

import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useKeyboardStore } from "@/stores/keyboard-store";

export function KeyboardShortcutsLoader() {
  const isBindingsLoaded = useKeyboardStore((s) => s.isBindingsLoaded);
  const setCustomBindings = useKeyboardStore((s) => s.setCustomBindings);

  // Gate on the Convex client's own auth state: the query needs a verified
  // identity, and mounting this on a signed-out page would otherwise fire an
  // unauthenticated read on every render of the marketing shell.
  const { isLoading, isAuthenticated } = useConvexAuth();
  const prefs = useQuery(
    api.features.users.preferences.getByUserId,
    !isLoading && isAuthenticated ? {} : "skip"
  );

  useEffect(() => {
    if (isBindingsLoaded || prefs === undefined) return;
    setCustomBindings(prefs.keyboardShortcuts ?? {});
  }, [isBindingsLoaded, prefs, setCustomBindings]);

  return null;
}
