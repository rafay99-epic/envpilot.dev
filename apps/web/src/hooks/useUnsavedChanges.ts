"use client";

import { useCallback, useEffect, useMemo } from "react";

/**
 * Dirty tracking for a settings form.
 *
 * Compares the live form values to the SNAPSHOT the page seeded from the
 * server, never to the live query result: Convex queries are reactive, so a
 * background write by someone else would otherwise register as "you edited
 * this" and light up the save bar on its own.
 *
 * Returns the changed field names, so the save bar can say "2 unsaved changes"
 * rather than a vague dot.
 */
/**
 * Module-level because the dirty form lives INSIDE a tab body while the thing
 * that must be blocked — the tab rail — lives in the shell above it. Exactly
 * one settings tab is mounted at a time, so a single flag is the honest model;
 * a context would be the same state with more wiring.
 */
let tabIsDirty = false;

/** True while a mounted settings form has unsaved edits. */
export function hasUnsavedSettings(): boolean {
  return tabIsDirty;
}

export function useUnsavedChanges<T extends Record<string, unknown>>(
  current: T,
  snapshot: T | null | undefined
): {
  isDirty: boolean;
  dirtyCount: number;
  dirtyFields: string[];
  /** Runs `action` only if clean, or if the user confirms losing the edits. */
  guard: (action: () => void, confirmMessage?: string) => void;
} {
  const dirtyFields = useMemo(() => {
    if (!snapshot) return [];
    return Object.keys(current).filter(
      (key) => !isEqual(current[key], snapshot[key as keyof T])
    );
  }, [current, snapshot]);

  const isDirty = dirtyFields.length > 0;

  // Registered only while dirty, so a clean form costs nothing and there is no
  // ref to keep in sync during render. Publishing the flag here (not during
  // render) keeps the tab rail's guard in step with the browser's own prompt,
  // and the cleanup covers unmount — otherwise a discarded tab would leave the
  // whole surface believing it is dirty.
  useEffect(() => {
    tabIsDirty = isDirty;
    if (!isDirty) return () => {};
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Chrome requires returnValue to be set; the string itself is ignored.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      tabIsDirty = false;
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty]);

  const guard = useCallback(
    (
      action: () => void,
      confirmMessage = "You have unsaved changes. Discard them?"
    ) => {
      if (!isDirty || window.confirm(confirmMessage)) action();
    },
    [isDirty]
  );

  return { isDirty, dirtyCount: dirtyFields.length, dirtyFields, guard };
}

/** Shallow-compares arrays by value so tag/environment lists behave. */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  // Treat "" and undefined as the same for optional text fields.
  if ((a ?? "") === "" && (b ?? "") === "") return true;
  return false;
}
