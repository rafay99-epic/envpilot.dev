import type { SettingsTabDef } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  GeneralSettings,
  type AccountUser,
} from "@/components/settings/account/General";
import { NotificationSettings } from "@/components/settings/account/Notifications";
import { IntegrationsSettings } from "@/components/settings/account/Integrations";
import { SecuritySettings } from "@/components/settings/account/Security";
import { CustomizationSettings } from "@/components/settings/account/Customization";
import { BillingSettings } from "@/components/settings/account/Billing";

/**
 * The account settings surface as data — adding a tab is an array entry.
 * `?tab=` values are these ids; `billing` is deep-linked from the usage page.
 */
export function accountSettingsTabs({
  user,
  organizationId,
  alreadyProNotice,
}: {
  user: AccountUser | null;
  organizationId: string | undefined;
  alreadyProNotice: boolean;
}): SettingsTabDef[] {
  return [
    {
      id: "general",
      label: "General",
      render: () => <GeneralSettings user={user} />,
    },
    {
      id: "notifications",
      label: "Notifications",
      render: () => <NotificationSettings />,
    },
    {
      id: "integrations",
      label: "Integrations",
      render: () => <IntegrationsSettings />,
    },
    {
      id: "security",
      label: "Security",
      render: () => <SecuritySettings />,
    },
    {
      id: "customization",
      label: "Customization",
      render: () => (
        <FeatureGate
          organizationId={organizationId as Id<"organizations"> | undefined}
          featureKey="keyboard_shortcuts_custom"
          featureName="Custom Keyboard Shortcuts"
          fallbackVariant="line"
        >
          <CustomizationSettings />
        </FeatureGate>
      ),
    },
    {
      id: "billing",
      label: "Billing",
      render: () => (
        <BillingSettings
          organizationId={organizationId}
          alreadyProNotice={alreadyProNotice}
        />
      ),
    },
  ];
}
