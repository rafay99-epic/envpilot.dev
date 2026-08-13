"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  firstOpenableTab,
  visibleTabs,
  type SettingsTabDef,
} from "@envpilot/ui";
import { hasUnsavedSettings } from "./useUnsavedChanges";

/**
 * `?tab=` is the single source of truth for every settings surface: back and
 * forward move tabs, and a tab is linkable. A local override would let the URL
 * and the rendered tab disagree after a click, which is what the account page
 * did before this hook.
 *
 * An unknown or locked tab falls back to the first one the viewer can open.
 */
export function useSettingsTab(tabs: SettingsTabDef[]): {
  active: string;
  onChange: (id: string) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const shown = visibleTabs(tabs);
  const requested = searchParams.get("tab");
  const match = shown.find((tab) => tab.id === requested && !tab.locked);
  const active = match?.id ?? firstOpenableTab(tabs) ?? shown[0]?.id ?? "";

  const onChange = useCallback(
    (id: string) => {
      // Re-clicking the active tab must do nothing. Replacing the URL with
      // itself still re-renders the tree, which remounts the tab body and
      // closes anything open inside it — an open drawer, a half-typed form.
      if (id === active) return;
      // Switching tabs unmounts the form, so unsaved edits die silently
      // without this — the browser's beforeunload never fires for a
      // client-side route change.
      if (
        hasUnsavedSettings() &&
        !window.confirm("You have unsaved changes. Discard them?")
      ) {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [active, pathname, router, searchParams]
  );

  return { active, onChange };
}
