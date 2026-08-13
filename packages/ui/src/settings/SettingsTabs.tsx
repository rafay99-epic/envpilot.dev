"use client";

import { visibleTabs, type SettingsTabDef } from "./types";

/**
 * Underline tab rail. Router-free by design: the app owns the URL and passes
 * `active` / `onChange`, which keeps this importable from the Vite admin app.
 */
export function SettingsTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SettingsTabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  const shown = visibleTabs(tabs);
  if (shown.length <= 1) return null;

  return (
    <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <nav
        aria-label="Settings sections"
        className="-mb-px flex min-w-max gap-6"
      >
        {shown.map((tab) => {
          const isActive = tab.id === active;
          const isLocked = Boolean(tab.locked);
          const tone =
            tab.tone === "danger"
              ? "text-danger hover:text-danger"
              : "text-ink-subtle hover:text-ink";

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => !isLocked && onChange(tab.id)}
              disabled={isLocked}
              aria-current={isActive ? "page" : undefined}
              title={tab.locked?.reason}
              className={`border-b-2 py-3 font-mono text-[13px] whitespace-nowrap transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : `border-transparent ${isLocked ? "cursor-not-allowed text-ink-faint" : tone}`
              }`}
            >
              {tab.label}
              {isLocked && (
                <span aria-hidden className="ml-1.5 text-ink-faint">
                  ·
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
