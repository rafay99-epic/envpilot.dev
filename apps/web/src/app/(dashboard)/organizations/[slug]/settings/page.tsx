"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Settings } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SettingsLayout } from "@envpilot/ui";
import { RequireRole } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { useFeatureGate, useOrganizationBySlug, useSettingsTab } from "@/hooks";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";
import { orgSettingsTabs } from "@/settings/org.tabs";

export default function OrganizationSettingsPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    // Page-level floor is team_lead — owner-only tabs are locked (not removed)
    // inside org.tabs.tsx so a team_lead/PM reaches API Keys and can still see
    // why the rest is shut.
    <RequireRole minimum="team_lead">
      <OrganizationSettingsPageContent {...props} />
    </RequireRole>
  );
}

function OrganizationSettingsPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const organization = useOrganizationBySlug(slug);

  const { allowed: showTags } = useFeatureGate(
    organization?._id as Id<"organizations"> | undefined,
    "variable_tags"
  );
  const { allowed: showShared } = useFeatureGate(
    organization?._id as Id<"organizations"> | undefined,
    "workspaces"
  );

  const tierData = useQuery(
    api.features.featureRegistry.queries.getResolvedFeatures,
    organization?._id
      ? { organizationId: organization._id as Id<"organizations"> }
      : "skip"
  );
  const orgTier = (tierData?.tierName as string) ?? "free";
  // The resolved map contains active registry rows only. Presence means the
  // feature exists globally; its boolean value separately controls whether
  // this tier receives the feature or sees the upgrade state.
  const notificationsRegistered =
    tierData?.features?.team_notifications !== undefined;

  // Owner-only sections stay owner-only; API Keys additionally opens up to
  // project managers and team leads (minting a project-scoped key is the same
  // bar as minting a CI/CD service token elsewhere in the app).
  // Sticky across reactive churn: a tab that flips locked→unlocked→locked
  // swaps its body for the lock message and back, which unmounts whatever was
  // open inside it (an in-progress key drawer, a half-typed form). The role
  // only moves forward here; the backend stays the real authority either way.
  const liveRole = normalizeOrgRole(organization?.role);
  const [stickyRole, setStickyRole] = useState(liveRole);
  // Adjusting state during render is React's own answer here — an effect
  // would land a frame late, and that frame is exactly when the body swaps.
  if (organization?.role !== undefined && stickyRole !== liveRole) {
    setStickyRole(liveRole);
  }
  const role = organization?.role !== undefined ? liveRole : stickyRole;

  const isOwner = role === "owner";
  const canManageApiKeys = roleLevel(role) >= ROLE_LEVEL.team_lead;

  const tabs = organization
    ? orgSettingsTabs({
        slug,
        organization,
        orgTier,
        isOwner,
        canManageApiKeys,
        showTags,
        showShared,
        notificationsRegistered,
      })
    : [];
  const { active, onChange } = useSettingsTab(tabs);

  if (organization === undefined) {
    return <TerminalLoading fullPage />;
  }

  if (!organization || roleLevel(role) < ROLE_LEVEL.team_lead) {
    return (
      <div className="mx-auto max-w-2xl">
        <h3 className="font-semibold text-warning">Permission denied</h3>
        <p className="mt-1 text-sm text-warning/80">
          Only organization owners, project managers, and team leads can access
          settings.
        </p>
        <Link
          href={`/organizations/${slug}`}
          className="mt-4 inline-flex items-center gap-1 text-sm text-warning hover:underline"
        >
          Back to Organization
        </Link>
      </div>
    );
  }

  return (
    <SettingsLayout
      icon={Settings}
      title="Organization settings"
      description="Manage your organization settings and preferences."
      cmd={`envpilot org settings ${slug}`}
      tabs={tabs}
      active={active}
      onChange={onChange}
    />
  );
}
