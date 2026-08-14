"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { SettingsLayout } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { useSettingsTab } from "@/hooks";
import { accountSettingsTabs } from "@/settings/account.tabs";

/**
 * useSearchParams() suspends, so the component that calls it needs its own
 * <Suspense> boundary — without one Next opts the whole route out of static
 * rendering and every visitor waits on client JS for the shell.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const { user, organization } = useAuthContext();
  const searchParams = useSearchParams();

  const tabs = accountSettingsTabs({
    user,
    organizationId: organization?.id,
    alreadyProNotice: searchParams.get("notice") === "already-pro",
  });
  const { active, onChange } = useSettingsTab(tabs);

  return (
    <SettingsLayout
      icon={Settings}
      title="Account settings"
      description="Manage your account preferences"
      cmd="envpilot account settings"
      tabs={tabs}
      active={active}
      onChange={onChange}
    />
  );
}
