import type { ElementType, ReactNode } from "react";
import { PageHeader } from "../app/PageHeader";
import { SettingsTabs } from "./SettingsTabs";
import { visibleTabs, type SettingsTabDef } from "./types";

/**
 * Header + tab rail + the active tab's body. The app owns the URL and the
 * data; this owns the chrome, so all three settings surfaces read the same.
 */
export function SettingsLayout({
  icon,
  title,
  description,
  cmd,
  actions,
  tabs,
  active,
  onChange,
}: {
  icon?: ElementType;
  title: string;
  description?: ReactNode;
  /** Mono `❯ cmd` line above the title. */
  cmd?: string;
  actions?: ReactNode;
  tabs: SettingsTabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  const shown = visibleTabs(tabs);
  const current = shown.find((tab) => tab.id === active) ?? shown[0];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={icon}
        title={title}
        description={description}
        actions={actions}
        cmd={cmd}
      />

      <SettingsTabs
        tabs={tabs}
        active={current?.id ?? ""}
        onChange={onChange}
      />

      <div className="max-w-4xl">
        {current?.locked ? (
          <p className="border-t border-line py-8 text-[14px] text-ink-subtle">
            {current.locked.reason}
          </p>
        ) : (
          current?.render()
        )}
      </div>
    </div>
  );
}
