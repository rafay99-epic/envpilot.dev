"use client";

import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { SettingsLayout } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { useSettingsTab } from "@/hooks";
import { accountSettingsTabs } from "@/settings/account.tabs";

export default function SettingsPage() {
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
