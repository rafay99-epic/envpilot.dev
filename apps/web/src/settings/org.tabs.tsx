import type { Id } from "@convex/_generated/dataModel";
import type { SettingsTabDef } from "@envpilot/ui";
import { ApiKeysSection } from "@/components/api-keys/ApiKeysSection";
import { IntegrationsSection } from "@/components/integrations/IntegrationsSection";
import { DangerTab } from "@/components/settings/org/Danger";
import { GeneralTab } from "@/components/settings/org/General";
import { SharedVariablesTab } from "@/components/settings/org/SharedVariables";
import { TagsTab } from "@/components/settings/org/Tags";

/**
 * Locked, not hidden: a team lead who lands here should learn the tab exists
 * and why it is shut, instead of silently seeing a one-tab page. `render` is
 * never called for a locked tab, so owner-only queries stay unmounted — the
 * lock is an affordance, the backend is still the boundary.
 */
const OWNER_ONLY = { reason: "Owner only — ask your organization owner." };

export function orgSettingsTabs({
  slug,
  organization,
  orgTier,
  isOwner,
  canManageApiKeys,
  showTags,
  showShared,
  notificationsRegistered,
}: {
  slug: string;
  organization: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
  };
  orgTier: string;
  isOwner: boolean;
  canManageApiKeys: boolean;
  showTags: boolean;
  showShared: boolean;
  notificationsRegistered: boolean;
}): SettingsTabDef[] {
  const organizationId = organization._id as Id<"organizations">;

  return [
    {
      id: "general",
      label: "General",
      locked: isOwner ? undefined : OWNER_ONLY,
      render: () => (
        <GeneralTab organization={organization} orgTier={orgTier} />
      ),
    },
    {
      id: "tags",
      label: "Tags",
      hidden: !showTags,
      locked: isOwner ? undefined : OWNER_ONLY,
      render: () => <TagsTab organizationId={organization._id} />,
    },
    {
      id: "shared",
      hidden: !showShared,
      label: "Shared variables",
      render: () => (
        <SharedVariablesTab organizationId={organizationId} isOwner={isOwner} />
      ),
    },
    {
      id: "apiKeys",
      label: "API Keys",
      locked: canManageApiKeys
        ? undefined
        : { reason: "Team leads and above only." },
      render: () => (
        <ApiKeysSection organizationId={organizationId} isOwner={isOwner} />
      ),
    },
    {
      // Webhook management is org.manage on the backend — owner by default.
      id: "integrations",
      label: "Integrations",
      hidden: !notificationsRegistered,
      locked: isOwner ? undefined : OWNER_ONLY,
      render: () => <IntegrationsSection organizationId={organizationId} />,
    },
    {
      id: "danger",
      label: "Danger Zone",
      tone: "danger",
      locked: isOwner ? undefined : OWNER_ONLY,
      render: () => (
        <DangerTab
          slug={slug}
          organizationId={organization._id}
          organizationName={organization.name}
        />
      ),
    },
  ];
}
