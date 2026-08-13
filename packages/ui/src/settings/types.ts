import type { ReactNode } from "react";

/**
 * A settings tab is data. Adding one is an array entry, removing one is a
 * deleted line — no page edit, no JSX surgery.
 *
 * `hidden` removes the tab entirely (the viewer has no business knowing it
 * exists). `locked` keeps it visible but disabled with a reason, which is what
 * you want when the absence itself is confusing.
 */
export interface SettingsTabDef {
  /** Also the `?tab=` value. */
  id: string;
  label: string;
  tone?: "default" | "danger";
  hidden?: boolean;
  locked?: { reason: string };
  render: () => ReactNode;
}

export function visibleTabs(tabs: SettingsTabDef[]): SettingsTabDef[] {
  return tabs.filter((tab) => !tab.hidden);
}

/** First tab the viewer can actually open, for fallbacks. */
export function firstOpenableTab(tabs: SettingsTabDef[]): string | undefined {
  return visibleTabs(tabs).find((tab) => !tab.locked)?.id;
}
