import type { SettingsTabDef } from "@envpilot/ui";
import { DangerTab } from "@/components/settings/project/Danger";
import { GeneralTab } from "@/components/settings/project/General";
import { IntegrationsTab } from "@/components/settings/project/Integrations";
import { ProtectionTab } from "@/components/settings/project/Protection";
import type { Doc } from "@convex/_generated/dataModel";

/**
 * Tabs are data: the page renders whatever this returns, so adding or gating
 * one is an array entry rather than JSX surgery in the page.
 */
export function projectSettingsTabs({
  project,
  canDelete,
  canManageProtection,
}: {
  project: Doc<"projects">;
  canDelete: boolean;
  canManageProtection: boolean;
}): SettingsTabDef[] {
  return [
    {
      id: "general",
      label: "General",
      render: () => <GeneralTab project={project} />,
    },
    {
      id: "integrations",
      label: "Integrations",
      render: () => <IntegrationsTab project={project} />,
    },
    {
      id: "protection",
      label: "Protection",
      hidden: !canManageProtection,
      render: () => <ProtectionTab project={project} />,
    },
    {
      id: "danger",
      label: "Danger zone",
      tone: "danger",
      hidden: !canDelete,
      render: () => <DangerTab project={project} />,
    },
  ];
}
