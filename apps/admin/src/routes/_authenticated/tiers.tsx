import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Crown, Shield, Plus, Pencil, Trash2, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tiers")({
  component: TiersPage,
});

interface TierFormData {
  name: string;
  displayName: string;
  description: string;
  sortOrder: number;
  isDefault: boolean;
  color: string;
  maxProjects: string;
  maxVariablesPerProject: string;
  maxTeamMembers: string;
  maxOrganizations: string;
  auditLogRetentionDays: string;
  apiAccessEnabled: boolean;
  extensionAccessEnabled: boolean;
  granularPermissionsEnabled: boolean;
  variableVersionHistoryEnabled: boolean;
  bulkImportEnabled: boolean;
}

const EMPTY_FORM: TierFormData = {
  name: "",
  displayName: "",
  description: "",
  sortOrder: 0,
  isDefault: false,
  color: "#71717a",
  maxProjects: "3",
  maxVariablesPerProject: "50",
  maxTeamMembers: "3",
  maxOrganizations: "1",
  auditLogRetentionDays: "7",
  apiAccessEnabled: true,
  extensionAccessEnabled: true,
  granularPermissionsEnabled: false,
  variableVersionHistoryEnabled: false,
  bulkImportEnabled: false,
};

function parseLimitValue(val: string): number | null {
  if (val === "" || val === "null" || val === "unlimited") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function limitToString(val: number | null): string {
  return val === null ? "unlimited" : val.toString();
}

interface OrgTierRow extends Record<string, unknown> {
  _id: string;
  organizationId: Id<"organizations">;
  organizationName: string;
  organizationSlug: string | null;
  memberCount: number;
  projectCount: number;
  tier: string;
}

function TiersPage() {
  const tierDefs = useAdminQuery(api.admin.listTierDefinitions, {});
  const orgTiers = useAdminQuery(api.admin.listOrganizationTiers, {});
  const settings = useAdminQuery(api.admin.getAdminSettings, {});
  const createTier = useAdminMutation(api.admin.createTierDefinition);
  const updateTier = useAdminMutation(api.admin.updateTierDefinition);
  const deleteTier = useAdminMutation(api.admin.deleteTierDefinition);
  const seedTiers = useAdminMutation(api.admin.seedDefaultTiers);
  const updateOrgTier = useAdminMutation(api.admin.updateOrganizationTier);
  const updateSetting = useAdminMutation(api.admin.updateAdminSetting);

  const tierEnforcement = settings?.tierEnforcement === "true";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tierDefinitions"> | null>(
    null
  );
  const [form, setForm] = useState<TierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      sortOrder: tierDefs ? tierDefs.length : 0,
    });
    setShowModal(true);
  };

  const openEdit = (tier: NonNullable<typeof tierDefs>[number]) => {
    setEditingId(tier._id);
    setForm({
      name: tier.name,
      displayName: tier.displayName,
      description: tier.description ?? "",
      sortOrder: tier.sortOrder,
      isDefault: tier.isDefault,
      color: tier.color ?? "#71717a",
      maxProjects: limitToString(tier.limits.maxProjects),
      maxVariablesPerProject: limitToString(tier.limits.maxVariablesPerProject),
      maxTeamMembers: limitToString(tier.limits.maxTeamMembers),
      maxOrganizations: limitToString(tier.limits.maxOrganizations),
      auditLogRetentionDays: tier.limits.auditLogRetentionDays.toString(),
      apiAccessEnabled: tier.features.apiAccessEnabled,
      extensionAccessEnabled: tier.features.extensionAccessEnabled,
      granularPermissionsEnabled: tier.features.granularPermissionsEnabled,
      variableVersionHistoryEnabled:
        tier.features.variableVersionHistoryEnabled,
      bulkImportEnabled: tier.features.bulkImportEnabled,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const limits = {
        maxProjects: parseLimitValue(form.maxProjects),
        maxVariablesPerProject: parseLimitValue(form.maxVariablesPerProject),
        maxTeamMembers: parseLimitValue(form.maxTeamMembers),
        maxOrganizations: parseLimitValue(form.maxOrganizations),
        auditLogRetentionDays: parseInt(form.auditLogRetentionDays, 10) || 7,
      };
      const features = {
        apiAccessEnabled: form.apiAccessEnabled,
        extensionAccessEnabled: form.extensionAccessEnabled,
        granularPermissionsEnabled: form.granularPermissionsEnabled,
        variableVersionHistoryEnabled: form.variableVersionHistoryEnabled,
        bulkImportEnabled: form.bulkImportEnabled,
      };

      if (editingId) {
        await updateTier({
          id: editingId,
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          color: form.color,
          limits,
          features,
        });
      } else {
        await createTier({
          name: form.name.toLowerCase().replace(/\s+/g, "_"),
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          color: form.color,
          limits,
          features,
        });
      }
      setShowModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save tier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: Id<"tierDefinitions">) => {
    if (!confirm("Are you sure you want to delete this tier?")) return;
    setDeleting(id);
    try {
      await deleteTier({ id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete tier");
    } finally {
      setDeleting(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedTiers({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to seed tiers");
    } finally {
      setSeeding(false);
    }
  };

  // Count how many orgs use each tier
  const tierUsageCounts: Record<string, number> = {};
  if (orgTiers) {
    for (const ot of orgTiers) {
      tierUsageCounts[ot.tier] = (tierUsageCounts[ot.tier] || 0) + 1;
    }
  }

  const orgColumns: Column<OrgTierRow>[] = [
    { key: "organizationName", header: "Organization", sortable: true },
    { key: "organizationSlug", header: "Slug" },
    { key: "memberCount", header: "Members", sortable: true },
    { key: "projectCount", header: "Projects", sortable: true },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <select
          value={row.tier}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            await updateOrgTier({
              organizationId: row.organizationId,
              newTier: e.target.value,
            });
          }}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
        >
          {tierDefs?.map((td) => (
            <option key={td.name} value={td.name}>
              {td.displayName}
            </option>
          ))}
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

      {/* Tier Definitions */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Tier Definitions
          </h2>
          <div className="flex gap-2">
            {tierDefs && tierDefs.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeed}
                disabled={seeding}
              >
                {seeding ? "Seeding..." : "Seed Defaults"}
              </Button>
            )}
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add Tier
            </Button>
          </div>
        </div>

        {!tierDefs ? (
          <Spinner />
        ) : tierDefs.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-zinc-400">
              No tier definitions yet. Click "Seed Defaults" to create the
              standard free and pro tiers, or add a custom tier.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {tierDefs.map((tier) => (
              <Card key={tier._id} className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: tier.color ?? "#71717a" }}
                    />
                    <h3 className="font-semibold text-zinc-100">
                      {tier.displayName}
                    </h3>
                    <Badge variant={tier.name === "pro" ? "purple" : "default"}>
                      {tier.name}
                    </Badge>
                    {tier.isDefault && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <Star className="h-3 w-3" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(tier)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tier._id)}
                      disabled={
                        deleting === tier._id ||
                        tier.isDefault ||
                        (tierUsageCounts[tier.name] ?? 0) > 0
                      }
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        tier.isDefault
                          ? "Cannot delete the default tier"
                          : (tierUsageCounts[tier.name] ?? 0) > 0
                            ? `${tierUsageCounts[tier.name]} org(s) use this tier`
                            : "Delete tier"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {tier.description && (
                  <p className="mb-3 text-xs text-zinc-400">
                    {tier.description}
                  </p>
                )}

                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-zinc-400">
                    Projects:{" "}
                    <span className="text-zinc-200">
                      {tier.limits.maxProjects ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Vars/Project:{" "}
                    <span className="text-zinc-200">
                      {tier.limits.maxVariablesPerProject ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Team Members:{" "}
                    <span className="text-zinc-200">
                      {tier.limits.maxTeamMembers ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Organizations:{" "}
                    <span className="text-zinc-200">
                      {tier.limits.maxOrganizations ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Audit Retention:{" "}
                    <span className="text-zinc-200">
                      {tier.limits.auditLogRetentionDays}d
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Orgs using:{" "}
                    <span className="text-zinc-200">
                      {tierUsageCounts[tier.name] ?? 0}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {tier.features.apiAccessEnabled && (
                    <Badge variant="success">API</Badge>
                  )}
                  {tier.features.extensionAccessEnabled && (
                    <Badge variant="success">Extension</Badge>
                  )}
                  {tier.features.granularPermissionsEnabled && (
                    <Badge variant="success">Permissions</Badge>
                  )}
                  {tier.features.variableVersionHistoryEnabled && (
                    <Badge variant="success">History</Badge>
                  )}
                  {tier.features.bulkImportEnabled && (
                    <Badge variant="success">Bulk Import</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Organization Tier Assignments */}
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        Organization Tiers
      </h2>
      {!orgTiers ? (
        <Spinner />
      ) : (
        <DataTable
          columns={orgColumns}
          data={orgTiers as unknown as OrgTierRow[]}
          rowKey={(row) => row._id}
          emptyMessage="No organizations found"
        />
      )}

      {/* Create/Edit Tier Modal */}
      <Modal
        isOpen={showModal}
        title={editingId ? "Edit Tier" : "Create Tier"}
        onClose={() => setShowModal(false)}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {!editingId && (
            <Input
              label="Tier Name (slug)"
              id="tier-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. enterprise"
            />
          )}
          <Input
            label="Display Name"
            id="tier-display-name"
            value={form.displayName}
            onChange={(e) =>
              setForm((f) => ({ ...f, displayName: e.target.value }))
            }
            placeholder="e.g. Enterprise"
          />
          <Input
            label="Description"
            id="tier-description"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Brief description of the tier"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sort Order"
              id="tier-sort-order"
              type="number"
              value={form.sortOrder.toString()}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sortOrder: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
            <Input
              label="Color (hex)"
              id="tier-color"
              value={form.color}
              onChange={(e) =>
                setForm((f) => ({ ...f, color: e.target.value }))
              }
              placeholder="#a855f7"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) =>
                setForm((f) => ({ ...f, isDefault: e.target.checked }))
              }
              className="rounded border-zinc-600 bg-zinc-800"
            />
            Set as default tier (assigned to new organizations)
          </label>

          <h3 className="pt-2 text-sm font-semibold text-zinc-200">Limits</h3>
          <p className="text-xs text-zinc-500">
            Enter a number or "unlimited" for no limit.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max Projects"
              id="tier-max-projects"
              value={form.maxProjects}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxProjects: e.target.value }))
              }
              placeholder="unlimited"
            />
            <Input
              label="Max Vars/Project"
              id="tier-max-vars"
              value={form.maxVariablesPerProject}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxVariablesPerProject: e.target.value,
                }))
              }
              placeholder="unlimited"
            />
            <Input
              label="Max Team Members"
              id="tier-max-members"
              value={form.maxTeamMembers}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxTeamMembers: e.target.value }))
              }
              placeholder="unlimited"
            />
            <Input
              label="Max Organizations"
              id="tier-max-orgs"
              value={form.maxOrganizations}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxOrganizations: e.target.value,
                }))
              }
              placeholder="unlimited"
            />
            <Input
              label="Audit Retention (days)"
              id="tier-audit-days"
              type="number"
              value={form.auditLogRetentionDays}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  auditLogRetentionDays: e.target.value,
                }))
              }
            />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-zinc-200">Features</h3>
          <div className="space-y-2">
            {[
              {
                key: "apiAccessEnabled" as const,
                label: "API Access",
              },
              {
                key: "extensionAccessEnabled" as const,
                label: "Extension Access",
              },
              {
                key: "granularPermissionsEnabled" as const,
                label: "Granular Permissions",
              },
              {
                key: "variableVersionHistoryEnabled" as const,
                label: "Variable Version History",
              },
              {
                key: "bulkImportEnabled" as const,
                label: "Bulk Import",
              },
            ].map((feat) => (
              <label
                key={feat.key}
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={form[feat.key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [feat.key]: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-600 bg-zinc-800"
                />
                {feat.label}
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Tier" : "Create Tier"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
