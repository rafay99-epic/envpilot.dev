import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { Shield } from "lucide-react";
import { TierDefinitionsTab } from "@/components/tiers/TierDefinitionsTab";
import { FeatureMatrixTab } from "@/components/tiers/FeatureMatrixTab";
import { UserTierAssignmentsTab } from "@/components/tiers/UserTierAssignmentsTab";
import { FeatureRegistryTab } from "@/components/tiers/FeatureRegistryTab";
import { CronJobsTab } from "@/components/tiers/CronJobsTab";
import { RotationVariablesTab } from "@/components/tiers/RotationVariablesTab";
import { PaymentProductsTab } from "@/components/tiers/PaymentProductsTab";

export const Route = createFileRoute("/_authenticated/tiers")({
  component: TiersPage,
});

/** ConvexError payloads survive prod redaction; plain Error.message does not */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) return String(err.data);
  return err instanceof Error ? err.message : fallback;
}

const TABS = [
  {
    id: "definitions",
    label: "Tier Definitions",
    Component: TierDefinitionsTab,
  },
  { id: "matrix", label: "Feature Matrix", Component: FeatureMatrixTab },
  { id: "users", label: "User Tiers", Component: UserTierAssignmentsTab },
  { id: "registry", label: "Feature Registry", Component: FeatureRegistryTab },
  { id: "crons", label: "Cron Jobs", Component: CronJobsTab },
  {
    id: "rotation",
    label: "Rotation Variables",
    Component: RotationVariablesTab,
  },
  { id: "products", label: "Payment Products", Component: PaymentProductsTab },
] as const;

function TiersPage() {
  const settings = useAdminQuery(
    api.features.admin.settings.getAdminSettings,
    {}
  );
  const updateSetting = useAdminMutation(
    api.features.admin.settings.updateAdminSetting
  );
  const tierEnforcement = settings?.tierEnforcement === "true";

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(
    TABS[0].id
  );
  const ActiveComponent =
    TABS.find((t) => t.id === activeTab)?.Component ?? TABS[0].Component;

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (index + dir + TABS.length) % TABS.length;
    setActiveTab(TABS[next].id);
    document.getElementById(`tier-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Tiers & Features</h1>

        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
          <Shield className="h-4 w-4 text-ink-muted" />
          <span className="text-sm text-ink-muted">Tier Enforcement</span>
          <Switch
            checked={tierEnforcement}
            disabled={settings === undefined}
            onChange={async (checked) => {
              try {
                await updateSetting({
                  key: "tierEnforcement",
                  value: checked ? "true" : "false",
                });
              } catch (err) {
                toast(
                  "error",
                  errMsg(err, "Failed to update tier enforcement")
                );
              }
            }}
          />
          <span
            className={`text-xs font-medium ${tierEnforcement ? "text-accent" : "text-ink-subtle"}`}
          >
            {tierEnforcement ? "Active" : "Disabled"}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Tiers & Features sections"
        className="mb-6 flex flex-wrap gap-1 border-b border-line"
      >
        {TABS.map((tab, i) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`tier-tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`tier-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                selected
                  ? "border-accent-line text-accent"
                  : "border-transparent text-ink-subtle hover:text-ink-muted"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Only the active tab is mounted — its Convex subscriptions open/close
          with the tab. */}
      <div
        role="tabpanel"
        id={`tier-panel-${activeTab}`}
        aria-labelledby={`tier-tab-${activeTab}`}
      >
        <ActiveComponent />
      </div>
    </div>
  );
}
