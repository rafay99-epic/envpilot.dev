"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader, SettingsLayout } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { useSettingsTab } from "@/hooks";
import { accountSettingsTabs } from "@/settings/account.tabs";

const header = {
  icon: Settings,
  title: "Account settings",
  description: "Manage your account preferences",
  cmd: "envpilot account settings",
};

// Both useSearchParams and useSettingsTab read the query string, so the whole
// body opts out of prerendering; the boundary keeps the header static.
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader {...header} />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
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
      {...header}
      tabs={tabs}
      active={active}
      onChange={onChange}
    />
  );
}
