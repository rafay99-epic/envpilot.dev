import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Crown, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tiers")({
  component: TiersPage,
});

const TIER_FIELDS = [
  { key: "maxProjects", label: "Max Projects", defaultFree: "3", defaultPro: "unlimited" },
  { key: "maxVariablesPerProject", label: "Max Variables/Project", defaultFree: "50", defaultPro: "unlimited" },
  { key: "maxTeamMembers", label: "Max Team Members", defaultFree: "3", defaultPro: "unlimited" },
  { key: "maxOrganizations", label: "Max Organizations", defaultFree: "1", defaultPro: "unlimited" },
  { key: "auditLogRetentionDays", label: "Audit Log Retention (days)", defaultFree: "7", defaultPro: "365" },
] as const;

function TiersPage() {
  const tierConfig = useAdminQuery(api.admin.getTierConfig, {});
  const orgTiers = useAdminQuery(api.admin.listOrganizationTiers, {});
  const settings = useAdminQuery(api.admin.getAdminSettings, {});
  const updateTierConfig = useAdminMutation(api.admin.updateTierConfig);
  const updateOrgTier = useAdminMutation(api.admin.updateOrganizationTier);
  const updateSetting = useAdminMutation(api.admin.updateAdminSetting);

  const tierEnforcement = settings?.tierEnforcement === "true";

  const [freeValues, setFreeValues] = useState<Record<string, string>>({});
  const [proValues, setProValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"free" | "pro" | null>(null);

  useEffect(() => {
    if (tierConfig) {
      const free: Record<string, string> = {};
      const pro: Record<string, string> = {};
      TIER_FIELDS.forEach((f) => {
        free[f.key] = tierConfig.free?.[f.key]?.toString() ?? "";
        pro[f.key] = tierConfig.pro?.[f.key]?.toString() ?? "";
      });
      setFreeValues(free);
      setProValues(pro);
    }
  }, [tierConfig]);

  const handleSave = async (tier: "free" | "pro") => {
    setSaving(tier);
    const values = tier === "free" ? freeValues : proValues;
    const fields: Record<string, number | null> = {};
    TIER_FIELDS.forEach((f) => {
      const raw = values[f.key];
      if (raw === "" || raw === undefined) return;
      if (raw === "null") { fields[f.key] = null; return; }
      const val = parseInt(raw, 10);
      if (!isNaN(val)) fields[f.key] = val;
    });
    try {
      await updateTierConfig({ tier, ...fields });
    } finally {
      setSaving(null);
    }
  };

  const orgColumns: Column<Record<string, unknown>>[] = [
    { key: "organizationName", header: "Organization", sortable: true },
    { key: "organizationSlug", header: "Slug" },
    { key: "memberCount", header: "Members", sortable: true },
    { key: "projectCount", header: "Projects", sortable: true },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <select
          value={row.tier as string}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            await updateOrgTier({
              organizationId: row.organizationId as any,
              newTier: e.target.value as "free" | "pro",
            });
          }}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Tiers & Limits</h1>

        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
          <Shield className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">Tier Enforcement</span>
          <button
            onClick={() =>
              updateSetting({
                key: "tierEnforcement",
                value: tierEnforcement ? "false" : "true",
              })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              tierEnforcement ? "bg-emerald-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                tierEnforcement ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-xs font-medium ${tierEnforcement ? "text-emerald-400" : "text-zinc-500"}`}
          >
            {tierEnforcement ? "Active" : "Disabled"}
          </span>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(["free", "pro"] as const).map((tier) => {
          const values = tier === "free" ? freeValues : proValues;
          const setValues = tier === "free" ? setFreeValues : setProValues;
          return (
            <Card key={tier}>
              <div className="mb-4 flex items-center gap-2">
                <Crown className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-semibold capitalize text-zinc-100">
                  {tier} Tier
                </h2>
                <Badge variant={tier === "pro" ? "purple" : "default"}>{tier}</Badge>
              </div>
              <div className="space-y-3">
                {TIER_FIELDS.map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    id={`${tier}-${field.key}`}
                    type="number"
                    placeholder={tier === "free" ? field.defaultFree : field.defaultPro}
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                ))}
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() => handleSave(tier)}
                disabled={saving === tier}
              >
                {saving === tier ? "Saving..." : `Save ${tier} config`}
              </Button>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-4 text-lg font-semibold text-zinc-100">Organization Tiers</h2>
      {!orgTiers ? (
        <Spinner />
      ) : (
        <DataTable
          columns={orgColumns}
          data={orgTiers as unknown as Record<string, unknown>[]}
          rowKey={(row) => row._id as string}
          emptyMessage="No organizations found"
        />
      )}
    </div>
  );
}
