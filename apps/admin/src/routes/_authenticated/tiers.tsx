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
import { useConfirmStore } from "@/stores/confirm-store";
import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  Crown,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Star,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/tiers")({
  component: TiersPage,
});

// ==========================================
// TYPES
// ==========================================

interface TierFormData {
  name: string;
  displayName: string;
  description: string;
  sortOrder: number;
  isDefault: boolean;
  color: string;
  stripePriceId: string;
}

const EMPTY_FORM: TierFormData = {
  name: "",
  displayName: "",
  description: "",
  sortOrder: 0,
  isDefault: false,
  color: "#71717a",
  stripePriceId: "",
};

interface UserTierRow extends Record<string, unknown> {
  _id: string;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  tier: string;
  ownedOrgCount: number;
  graceActive: boolean;
  gracePeriodEnd?: number;
}

// ==========================================
// MAIN PAGE
// ==========================================

function TiersPage() {
  const tierDefs = useAdminQuery(api.admin.listTierDefinitions, {});
  const settings = useAdminQuery(api.admin.getAdminSettings, {});
  const featureRegistry = useAdminQuery(api.admin.listFeatureRegistry, {});
  const tierFeatures = useAdminQuery(api.admin.listTierFeatures, {});
  const userTiers = useAdminQuery(api.admin.listUserTiers, {});

  const createTier = useAdminMutation(api.admin.createTierDefinition);
  const updateTier = useAdminMutation(api.admin.updateTierDefinition);
  const deleteTier = useAdminMutation(api.admin.deleteTierDefinition);
  const { confirm } = useConfirmStore();
  const seedTiers = useAdminMutation(api.admin.seedDefaultTiers);
  const updateSetting = useAdminMutation(api.admin.updateAdminSetting);
  const setTierFeatureValue = useAdminMutation(api.admin.setTierFeatureValue);
  const removeTierFeatureOverride = useAdminMutation(
    api.admin.removeTierFeatureOverride
  );
  const toggleFeatureActive = useAdminMutation(api.admin.toggleFeatureActive);
  const updateUserTier = useAdminMutation(api.admin.updateUserTier);

  const tierEnforcement = settings?.tierEnforcement === "true";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tierDefinitions"> | null>(
    null
  );
  const [form, setForm] = useState<TierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});

  // ==========================================
  // TIER DEFINITION CRUD
  // ==========================================

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
      stripePriceId: tier.stripePriceId ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateTier({
          id: editingId,
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          color: form.color,
          stripePriceId: form.stripePriceId || undefined,
        });
      } else {
        await createTier({
          name: form.name.toLowerCase().replace(/\s+/g, "_"),
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          color: form.color,
          stripePriceId: form.stripePriceId || undefined,
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
    const ok = await confirm({
      title: "Delete Tier",
      message:
        "This tier definition will be permanently deleted. Users on this tier will fall back to defaults.",
      confirmLabel: "Delete Tier",
      variant: "danger",
    });
    if (!ok) return;
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

  // Count how many users are on each tier
  const tierUsageCounts: Record<string, number> = {};
  if (userTiers) {
    for (const ut of userTiers as Array<{ tier: string }>) {
      tierUsageCounts[ut.tier] = (tierUsageCounts[ut.tier] || 0) + 1;
    }
  }

  // ==========================================
  // FEATURE MATRIX HELPERS
  // ==========================================

  // Build a lookup: tierName -> featureKey -> value
  const tierFeatureMap: Record<string, Record<string, string>> = {};
  if (tierFeatures) {
    for (const tf of tierFeatures) {
      if (!tierFeatureMap[tf.tierName]) tierFeatureMap[tf.tierName] = {};
      tierFeatureMap[tf.tierName][tf.featureKey] = tf.value;
    }
  }

  const getOverrideValue = (
    tierName: string,
    featureKey: string
  ): string | undefined => {
    return tierFeatureMap[tierName]?.[featureKey];
  };

  const getEffectiveValue = (
    tierName: string,
    featureKey: string,
    defaultValue: string
  ): string => {
    return getOverrideValue(tierName, featureKey) ?? defaultValue;
  };

  // Group features by category
  const featuresByCategory: Record<
    string,
    NonNullable<typeof featureRegistry>
  > = {};
  if (featureRegistry) {
    for (const f of featureRegistry) {
      if (!featuresByCategory[f.category]) featuresByCategory[f.category] = [];
      featuresByCategory[f.category].push(f);
    }
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const handleMatrixChange = async (
    tierName: string,
    featureKey: string,
    value: string,
    defaultValue: string
  ) => {
    try {
      if (value === defaultValue) {
        // Revert to default — remove override
        await removeTierFeatureOverride({ tierName, featureKey });
      } else {
        await setTierFeatureValue({ tierName, featureKey, value });
      }
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to update feature value"
      );
    }
  };

  // ==========================================
  // USER TIER COLUMNS
  // ==========================================

  const userTierColumns: Column<UserTierRow>[] = [
    { key: "userName", header: "User", sortable: true },
    { key: "userEmail", header: "Email", sortable: true },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <select
          value={row.tier}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            try {
              await updateUserTier({
                userId: row.userId,
                tier: e.target.value,
                reason: "admin.manual_reassignment",
              });
            } catch (err) {
              alert(
                err instanceof Error ? err.message : "Failed to update tier"
              );
            }
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
    { key: "ownedOrgCount", header: "Owned Orgs", sortable: true },
    {
      key: "graceActive",
      header: "Grace Period",
      render: (row) =>
        row.graceActive ? (
          <Badge variant="default">
            {Math.ceil(
              ((row.gracePeriodEnd ?? 0) - Date.now()) / (1000 * 60 * 60 * 24)
            )}
            d left
          </Badge>
        ) : (
          <span className="text-zinc-500">—</span>
        ),
    },
  ];

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Tiers & Features
        </h1>

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

      {/* ==========================================
          SECTION 1: TIER DEFINITIONS
          ========================================== */}
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
              No tier definitions yet. Click &quot;Seed Defaults&quot; to create
              the standard free and pro tiers, or add a custom tier.
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
                            ? `${tierUsageCounts[tier.name]} user(s) on this tier`
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

                <div className="text-xs text-zinc-400">
                  Users:{" "}
                  <span className="text-zinc-200">
                    {tierUsageCounts[tier.name] ?? 0}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ==========================================
          SECTION 2: FEATURE CONFIGURATION MATRIX
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Feature Configuration Matrix
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Configure the value of each feature per tier. Bold values are
          tier-specific overrides; gray values use the feature&apos;s default.
        </p>

        {!featureRegistry || !tierDefs || !tierFeatures ? (
          <Spinner />
        ) : featureRegistry.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-zinc-400">
              No features registered. Run the seed function to populate the
              feature registry.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">
                    Feature
                  </th>
                  {tierDefs.map((td) => (
                    <th
                      key={td.name}
                      className="px-4 py-3 text-center text-xs font-medium text-zinc-400"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: td.color ?? "#71717a",
                          }}
                        />
                        {td.displayName}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(featuresByCategory).map(
                  ([category, features]) => (
                    <>
                      {/* Category header row */}
                      <tr
                        key={`cat-${category}`}
                        className="cursor-pointer border-b border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/30"
                        onClick={() => toggleCategory(category)}
                      >
                        <td
                          colSpan={1 + (tierDefs?.length ?? 0)}
                          className="px-4 py-2"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                            {collapsedCategories[category] ? (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            {category}
                            <span className="font-normal text-zinc-500">
                              ({features.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Feature rows */}
                      {!collapsedCategories[category] &&
                        features.map((feature) => (
                          <tr
                            key={feature._id}
                            className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                          >
                            <td className="px-4 py-2.5">
                              <div className="text-xs text-zinc-300">
                                {feature.displayName}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                {feature.key}{" "}
                                <span className="text-zinc-600">
                                  ({feature.valueType})
                                </span>
                              </div>
                            </td>
                            {tierDefs.map((td) => {
                              const override = getOverrideValue(
                                td.name,
                                feature.key
                              );
                              const effective = getEffectiveValue(
                                td.name,
                                feature.key,
                                feature.defaultValue
                              );
                              const hasOverride = override !== undefined;

                              return (
                                <td
                                  key={td.name}
                                  className="px-4 py-2.5 text-center"
                                >
                                  {feature.valueType === "boolean" ? (
                                    <BooleanCell
                                      value={effective === "true"}
                                      hasOverride={hasOverride}
                                      onChange={(val) =>
                                        handleMatrixChange(
                                          td.name,
                                          feature.key,
                                          val ? "true" : "false",
                                          feature.defaultValue
                                        )
                                      }
                                    />
                                  ) : (
                                    <NumericCell
                                      value={effective}
                                      hasOverride={hasOverride}
                                      onChange={(val) =>
                                        handleMatrixChange(
                                          td.name,
                                          feature.key,
                                          val,
                                          feature.defaultValue
                                        )
                                      }
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==========================================
          SECTION 3: USER TIER ASSIGNMENTS
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          User Tier Assignments
        </h2>
        {!userTiers ? (
          <Spinner />
        ) : userTiers.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-zinc-400">
              No user tier assignments yet. Users will be assigned tiers when
              they subscribe or are manually assigned.
            </p>
          </Card>
        ) : (
          <DataTable
            columns={userTierColumns}
            data={userTiers as unknown as UserTierRow[]}
            rowKey={(row) => row._id}
            emptyMessage="No user tiers found"
          />
        )}
      </div>

      {/* ==========================================
          SECTION 4: FEATURE REGISTRY (read-only)
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Feature Registry
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Features are developer-seeded. Admin can only toggle active/inactive.
        </p>
        {!featureRegistry ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Key
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Display Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Category
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Default
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Active
                  </th>
                </tr>
              </thead>
              <tbody>
                {featureRegistry.map((f) => (
                  <tr
                    key={f._id}
                    className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                      {f.key}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-300">
                      {f.displayName}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          f.valueType === "boolean" ? "default" : "purple"
                        }
                      >
                        {f.valueType}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {f.category}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {f.defaultValue === "null" ? "unlimited" : f.defaultValue}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() =>
                          toggleFeatureActive({
                            featureId: f._id,
                            isActive: !f.isActive,
                          })
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          f.isActive ? "bg-emerald-600" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                            f.isActive ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==========================================
          TIER CREATE/EDIT MODAL
          ========================================== */}
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
          <div className="grid grid-cols-3 gap-4">
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
            <Input
              label="Stripe Price ID"
              id="tier-stripe-price"
              value={form.stripePriceId}
              onChange={(e) =>
                setForm((f) => ({ ...f, stripePriceId: e.target.value }))
              }
              placeholder="price_..."
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
            Set as default tier (assigned to new users)
          </label>

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

// ==========================================
// MATRIX CELL COMPONENTS
// ==========================================

function BooleanCell({
  value,
  hasOverride,
  onChange,
}: {
  value: boolean;
  hasOverride: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? "bg-emerald-600" : "bg-zinc-700"
      }`}
      title={hasOverride ? "Tier override" : "Using default"}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full transition-transform ${
          hasOverride ? "bg-white" : "bg-zinc-400"
        } ${value ? "translate-x-5" : "translate-x-1"}`}
      />
    </button>
  );
}

function NumericCell({
  value,
  hasOverride,
  onChange,
}: {
  value: string;
  hasOverride: boolean;
  onChange: (val: string) => void;
}) {
  const isUnlimited = value === "null";
  const displayVal = isUnlimited ? "" : value;

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        type="text"
        value={isUnlimited ? "" : displayVal}
        placeholder="∞"
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "" || v === "∞") {
            onChange("null");
          } else {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) {
              onChange(n.toString());
            }
          }
        }}
        className={`w-16 rounded border px-2 py-1 text-center text-xs ${
          hasOverride
            ? "border-emerald-600/50 bg-zinc-800 font-semibold text-zinc-100"
            : "border-zinc-700 bg-zinc-900 text-zinc-400"
        } focus:border-emerald-500 focus:outline-none`}
      />
      <label className="flex items-center gap-0.5 text-[10px] text-zinc-500">
        <input
          type="checkbox"
          checked={isUnlimited}
          onChange={(e) => {
            if (e.target.checked) {
              onChange("null");
            } else {
              onChange("0");
            }
          }}
          className="h-3 w-3 rounded border-zinc-600 bg-zinc-800"
        />
        ∞
      </label>
    </div>
  );
}
