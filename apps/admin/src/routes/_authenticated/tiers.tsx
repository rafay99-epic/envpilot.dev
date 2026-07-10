import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Drawer } from "@/components/ui/Drawer";
import { toast } from "@/components/ui/Toast";
import { useConfirmStore } from "@/stores/confirm-store";
import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Star,
  Timer,
  Pause,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
  Check,
  Undo2,
  Users,
  Palette,
  CreditCard,
  ArrowUpDown,
  Tag,
  Info,
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
  isComingSoon: boolean;
  color: string;
  polarProductId: string;
}

interface TierFormErrors {
  name?: string;
  displayName?: string;
  sortOrder?: string;
  color?: string;
}

const EMPTY_FORM: TierFormData = {
  name: "",
  displayName: "",
  description: "",
  sortOrder: 0,
  isDefault: false,
  isComingSoon: false,
  color: "#71717a",
  polarProductId: "",
};

const PRESET_COLORS = [
  { hex: "#71717a", label: "Zinc" },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#a855f7", label: "Purple" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#ec4899", label: "Pink" },
  { hex: "#06b6d4", label: "Cyan" },
];

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
// FORM VALIDATION
// ==========================================

function validateForm(form: TierFormData, isEditing: boolean): TierFormErrors {
  const errors: TierFormErrors = {};

  if (!isEditing) {
    const slug = form.name.trim();
    if (!slug) {
      errors.name = "Tier slug is required";
    } else if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
      errors.name =
        "Must start with a letter, lowercase alphanumeric and underscores only";
    }
  }

  if (!form.displayName.trim()) {
    errors.displayName = "Display name is required";
  }

  if (form.sortOrder < 0) {
    errors.sortOrder = "Sort order must be 0 or greater";
  }

  if (form.color && !/^#[0-9a-fA-F]{6}$/.test(form.color)) {
    errors.color = "Must be a valid hex color (e.g. #a855f7)";
  }

  return errors;
}

function hasErrors(errors: TierFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ==========================================
// MAIN PAGE
// ==========================================

function TiersPage() {
  const tierDefs = useAdminQuery(
    api.features.admin.tiers.listTierDefinitions,
    {}
  );
  const settings = useAdminQuery(
    api.features.admin.settings.getAdminSettings,
    {}
  );
  const featureRegistry = useAdminQuery(
    api.features.admin.featureFlags.listFeatureRegistry,
    {}
  );
  const tierFeatures = useAdminQuery(
    api.features.admin.featureFlags.listTierFeatures,
    {}
  );
  const userTiers = useAdminQuery(api.features.admin.users.listUserTiers, {});

  const createTier = useAdminMutation(
    api.features.admin.tiers.createTierDefinition
  );
  const updateTier = useAdminMutation(
    api.features.admin.tiers.updateTierDefinition
  );
  const deleteTier = useAdminMutation(
    api.features.admin.tiers.deleteTierDefinition
  );
  const { confirm } = useConfirmStore();
  const seedTiers = useAdminMutation(api.features.admin.tiers.seedDefaultTiers);
  const updateSetting = useAdminMutation(
    api.features.admin.settings.updateAdminSetting
  );
  const setTierFeatureValue = useAdminMutation(
    api.features.admin.featureFlags.setTierFeatureValue
  );
  const removeTierFeatureOverride = useAdminMutation(
    api.features.admin.featureFlags.removeTierFeatureOverride
  );
  const toggleFeatureActive = useAdminMutation(
    api.features.admin.featureFlags.toggleFeatureActive
  );
  const updateUserTier = useAdminMutation(
    api.features.admin.users.updateUserTier
  );

  const cronJobs = useAdminQuery(api.features.admin.crons.listCronJobs, {});
  const rotationVars = useAdminQuery(
    api.features.admin.variables.listRotationVariables,
    {}
  );
  const toggleCronPause = useAdminMutation(
    api.features.admin.crons.toggleCronPause
  );
  const updateVariableExpiry = useAdminMutation(
    api.features.admin.variables.updateVariableExpiry
  );

  const paymentProducts = useAdminQuery(
    api.features.admin.tiers.listPaymentProducts,
    {}
  );
  const createPaymentProduct = useAdminMutation(
    api.features.admin.tiers.createPaymentProduct
  );
  const updatePaymentProduct = useAdminMutation(
    api.features.admin.tiers.updatePaymentProduct
  );
  const deletePaymentProduct = useAdminMutation(
    api.features.admin.tiers.deletePaymentProduct
  );
  const seedPaymentProducts = useAdminMutation(
    api.features.admin.tiers.seedPaymentProducts
  );

  const tierEnforcement = settings?.tierEnforcement === "true";

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tierDefinitions"> | null>(
    null
  );
  const [form, setForm] = useState<TierFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<TierFormErrors>({});
  const [formTouched, setFormTouched] = useState(false);
  const initialFormRef = useRef<TierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});
  const [matrixSearch, setMatrixSearch] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    string | null
  >(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] =
    useState<Id<"paymentProducts"> | null>(null);
  const [productForm, setProductForm] = useState({
    tierName: "",
    provider: "polar",
    productId: "",
    isActive: true,
    label: "",
  });
  const [productSaving, setProductSaving] = useState(false);
  const [seedingProducts, setSeedingProducts] = useState(false);

  // ==========================================
  // TIER DEFINITION CRUD
  // ==========================================

  const openCreate = () => {
    setEditingId(null);
    const initial = {
      ...EMPTY_FORM,
      sortOrder: tierDefs ? tierDefs.length : 0,
    };
    setForm(initial);
    initialFormRef.current = initial;
    setFormErrors({});
    setFormTouched(false);
    setShowModal(true);
  };

  const openEdit = (tier: NonNullable<typeof tierDefs>[number]) => {
    setEditingId(tier._id);
    const initial: TierFormData = {
      name: tier.name,
      displayName: tier.displayName,
      description: tier.description ?? "",
      sortOrder: tier.sortOrder,
      isDefault: tier.isDefault,
      isComingSoon: tier.isComingSoon ?? false,
      color: tier.color ?? "#71717a",
      polarProductId: tier.polarProductId ?? "",
    };
    setForm(initial);
    initialFormRef.current = initial;
    setFormErrors({});
    setFormTouched(false);
    setShowModal(true);
  };

  const isFormDirty = useCallback((): boolean => {
    const initial = initialFormRef.current;
    return (
      form.name !== initial.name ||
      form.displayName !== initial.displayName ||
      form.description !== initial.description ||
      form.sortOrder !== initial.sortOrder ||
      form.isDefault !== initial.isDefault ||
      form.isComingSoon !== initial.isComingSoon ||
      form.color !== initial.color ||
      form.polarProductId !== initial.polarProductId
    );
  }, [form]);

  const handleBeforeClose = useCallback(async (): Promise<boolean> => {
    if (!isFormDirty()) return true;
    return confirm({
      title: "Unsaved Changes",
      message:
        "You have unsaved changes. Are you sure you want to discard them?",
      confirmLabel: "Discard",
      cancelLabel: "Keep Editing",
      variant: "warning",
    });
  }, [isFormDirty, confirm]);

  const updateFormField = <K extends keyof TierFormData>(
    field: K,
    value: TierFormData[K]
  ) => {
    const next = { ...form, [field]: value };

    // Auto-generate slug from display name when creating
    if (field === "displayName" && !editingId) {
      next.name = (value as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    }

    setForm(next);

    if (formTouched) {
      const errors = validateForm(next, !!editingId);
      setFormErrors(errors);
    }
  };

  const handleSave = async () => {
    setFormTouched(true);
    const errors = validateForm(form, !!editingId);
    setFormErrors(errors);
    if (hasErrors(errors)) return;

    setSaving(true);
    try {
      if (editingId) {
        await updateTier({
          id: editingId,
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          isComingSoon: form.isComingSoon,
          color: form.color,
          polarProductId: form.polarProductId || undefined,
        });
        toast("success", `Tier "${form.displayName}" updated`);
      } else {
        await createTier({
          name: form.name.toLowerCase().replace(/\s+/g, "_"),
          displayName: form.displayName,
          description: form.description || undefined,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          isComingSoon: form.isComingSoon,
          color: form.color,
          polarProductId: form.polarProductId || undefined,
        });
        toast("success", `Tier "${form.displayName}" created`);
      }
      setShowModal(false);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to save tier"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: Id<"tierDefinitions">) => {
    const tier = tierDefs?.find((t) => t._id === id);
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
      toast("success", `Tier "${tier?.displayName ?? "unknown"}" deleted`);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to delete tier"
      );
    } finally {
      setDeleting(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedTiers({});
      toast("success", "Default tiers seeded successfully");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to seed tiers"
      );
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
        await removeTierFeatureOverride({ tierName, featureKey });
      } else {
        await setTierFeatureValue({ tierName, featureKey, value });
      }
      toast("success", "Feature value updated");
    } catch (err) {
      toast(
        "error",
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
              toast("success", `Tier updated for ${row.userName}`);
            } catch (err) {
              toast(
                "error",
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
            {tierDefs.map((tier) => {
              const userCount = tierUsageCounts[tier.name] ?? 0;
              const canDelete =
                !tier.isDefault && userCount === 0 && deleting !== tier._id;

              return (
                <Card key={tier._id} className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: tier.color ?? "#71717a",
                          boxShadow: `0 0 0 2px var(--color-zinc-900), 0 0 0 3px ${tier.color ?? "#71717a"}`,
                        }}
                      />
                      <h3 className="font-semibold text-zinc-100">
                        {tier.displayName}
                      </h3>
                      <Badge
                        variant={tier.name === "pro" ? "purple" : "default"}
                      >
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
                        className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                        title="Edit tier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tier._id)}
                        disabled={!canDelete}
                        className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                        title={
                          tier.isDefault
                            ? "Cannot delete the default tier"
                            : userCount > 0
                              ? `${userCount} user(s) on this tier`
                              : "Delete tier"
                        }
                      >
                        {deleting === tier._id ? (
                          <Spinner />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {tier.description && (
                    <p className="mb-3 text-xs text-zinc-400">
                      {tier.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {userCount} user{userCount !== 1 ? "s" : ""}
                    </span>
                    {tier.polarProductId && (
                      <span
                        className="flex items-center gap-1 text-zinc-500"
                        title={tier.polarProductId}
                      >
                        <CreditCard className="h-3 w-3" />
                        Polar linked
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ==========================================
          SECTION 2: FEATURE CONFIGURATION MATRIX
          ========================================== */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">
            Feature Configuration Matrix
          </h2>
          {featureRegistry && featureRegistry.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allCats = Object.keys(featuresByCategory);
                  const allCollapsed = allCats.every(
                    (c) => collapsedCategories[c]
                  );
                  const next: Record<string, boolean> = {};
                  for (const c of allCats) next[c] = !allCollapsed;
                  setCollapsedCategories(next);
                }}
                className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                title={
                  Object.keys(featuresByCategory).every(
                    (c) => collapsedCategories[c]
                  )
                    ? "Expand all categories"
                    : "Collapse all categories"
                }
              >
                {Object.keys(featuresByCategory).every(
                  (c) => collapsedCategories[c]
                ) ? (
                  <>
                    <ChevronsUpDown className="h-3 w-3" />
                    Expand All
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="h-3 w-3" />
                    Collapse All
                  </>
                )}
              </button>
            </div>
          )}
        </div>
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
          <>
            {/* Search & Category Filters */}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search features by name or key…"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-8 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-600 focus:outline-none"
                />
                {matrixSearch && (
                  <button
                    onClick={() => setMatrixSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveCategoryFilter(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeCategoryFilter === null
                      ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/40"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                {Object.keys(featuresByCategory).map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setActiveCategoryFilter(
                        activeCategoryFilter === cat ? null : cat
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      activeCategoryFilter === cat
                        ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/40"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtered results summary */}
            {(() => {
              const searchLower = matrixSearch.toLowerCase();
              const filteredCount = featureRegistry.filter((f) => {
                const matchesSearch =
                  !matrixSearch ||
                  f.displayName.toLowerCase().includes(searchLower) ||
                  f.key.toLowerCase().includes(searchLower);
                const matchesCategory =
                  !activeCategoryFilter || f.category === activeCategoryFilter;
                return matchesSearch && matchesCategory;
              }).length;

              if (matrixSearch || activeCategoryFilter) {
                return (
                  <p className="mb-2 text-[11px] text-zinc-500">
                    Showing {filteredCount} of {featureRegistry.length} features
                    {matrixSearch && (
                      <>
                        {" "}
                        matching &ldquo;
                        <span className="text-zinc-300">{matrixSearch}</span>
                        &rdquo;
                      </>
                    )}
                    {activeCategoryFilter && (
                      <>
                        {" "}
                        in{" "}
                        <span className="text-zinc-300">
                          {activeCategoryFilter}
                        </span>
                      </>
                    )}
                  </p>
                );
              }
              return null;
            })()}

            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
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
                  {Object.entries(featuresByCategory)
                    .filter(
                      ([category]) =>
                        !activeCategoryFilter ||
                        category === activeCategoryFilter
                    )
                    .map(([category, features]) => {
                      const searchLower = matrixSearch.toLowerCase();
                      const filteredFeatures = matrixSearch
                        ? features.filter(
                            (f) =>
                              f.displayName
                                .toLowerCase()
                                .includes(searchLower) ||
                              f.key.toLowerCase().includes(searchLower)
                          )
                        : features;

                      if (filteredFeatures.length === 0) return null;

                      return (
                        <FeatureCategoryGroup
                          key={category}
                          category={category}
                          features={filteredFeatures}
                          totalCount={features.length}
                          tierDefs={tierDefs}
                          collapsed={
                            !!collapsedCategories[category] && !matrixSearch
                          }
                          onToggle={() => toggleCategory(category)}
                          getOverrideValue={getOverrideValue}
                          getEffectiveValue={getEffectiveValue}
                          handleMatrixChange={handleMatrixChange}
                          searchQuery={matrixSearch}
                        />
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
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
                        onClick={async () => {
                          try {
                            await toggleFeatureActive({
                              featureId: f._id,
                              isActive: !f.isActive,
                            });
                            toast(
                              "success",
                              `${f.displayName} ${!f.isActive ? "activated" : "deactivated"}`
                            );
                          } catch (err) {
                            toast(
                              "error",
                              err instanceof Error
                                ? err.message
                                : "Failed to toggle feature"
                            );
                          }
                        }}
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
          SECTION 5: CRON JOBS
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          <Timer className="mr-2 inline h-4 w-4 text-zinc-400" />
          Cron Jobs
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Crons run on a fixed schedule. Pausing makes the handler skip all work
          — the cron still fires but does nothing.
        </p>
        {!cronJobs ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Function
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Interval
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {cronJobs.map((cron) => (
                  <tr
                    key={cron.settingKey}
                    className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                  >
                    <td className="px-4 py-2 text-xs text-zinc-300">
                      {cron.name}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                      {cron.function}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {cron.interval}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Badge variant={cron.paused ? "danger" : "success"}>
                        {cron.paused ? "Paused" : "Running"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={async () => {
                          try {
                            const result = await toggleCronPause({
                              settingKey: cron.settingKey,
                            });
                            toast(
                              "success",
                              `${cron.name} ${result.paused ? "paused" : "resumed"}`
                            );
                          } catch (err) {
                            toast(
                              "error",
                              err instanceof Error
                                ? err.message
                                : "Failed to toggle cron"
                            );
                          }
                        }}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                          cron.paused
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        }`}
                      >
                        {cron.paused ? (
                          <>
                            <Play className="h-3 w-3" /> Resume
                          </>
                        ) : (
                          <>
                            <Pause className="h-3 w-3" /> Pause
                          </>
                        )}
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
          SECTION 6: ROTATION VARIABLES (testing tools)
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          <RotateCcw className="mr-2 inline h-4 w-4 text-zinc-400" />
          Rotation-Enabled Variables
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Edit expiry timestamps for testing. Click a time to set it to minutes
          from now.
        </p>
        {!rotationVars ? (
          <Spinner />
        ) : rotationVars.length === 0 ? (
          <Card>
            <p className="py-4 text-center text-sm text-zinc-500">
              No rotation-enabled variables found.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Variable
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Project
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Frequency
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Expires At
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Quick Set
                  </th>
                </tr>
              </thead>
              <tbody>
                {rotationVars.map((v) => (
                  <tr
                    key={v._id}
                    className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                      {v.key}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {v.projectName}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {v.rotationFrequencyDays}d
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {new Date(v.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Badge
                        variant={
                          v.rotationStatus === "expired"
                            ? "danger"
                            : v.rotationStatus === "expiring_soon"
                              ? "warning"
                              : "success"
                        }
                      >
                        {v.rotationStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {[
                          { label: "2m", minutes: 2 },
                          { label: "30m", minutes: 30 },
                          { label: "5h", minutes: 300 },
                          { label: "Past", minutes: -1 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            onClick={async () => {
                              try {
                                const newExpiry =
                                  preset.minutes < 0
                                    ? Date.now() - 1000
                                    : Date.now() + preset.minutes * 60 * 1000;
                                await updateVariableExpiry({
                                  variableId: v._id,
                                  expiresAt: newExpiry,
                                  rotationStatus:
                                    preset.minutes < 0
                                      ? "active"
                                      : preset.minutes <= 30
                                        ? "active"
                                        : "active",
                                });
                                toast(
                                  "success",
                                  `${v.key} expiry set to ${preset.label === "Past" ? "expired" : preset.label + " from now"}`
                                );
                              } catch (err) {
                                toast(
                                  "error",
                                  err instanceof Error
                                    ? err.message
                                    : "Failed to update"
                                );
                              }
                            }}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              preset.minutes < 0
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==========================================
          TIER CREATE/EDIT DRAWER
          ========================================== */}
      <Drawer
        isOpen={showModal}
        title={editingId ? "Edit Tier" : "Create New Tier"}
        description={
          editingId
            ? "Changes apply immediately to all users on this tier."
            : "Define a new tier for your platform."
        }
        onClose={() => setShowModal(false)}
        onBeforeClose={handleBeforeClose}
        width="max-w-lg"
      >
        <div className="flex h-full flex-col">
          {/* Live preview card */}
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Preview
            </p>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg"
                style={{
                  backgroundColor: /^#[0-9a-fA-F]{6}$/.test(form.color)
                    ? form.color
                    : "#71717a",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">
                    {form.displayName || "Tier Name"}
                  </span>
                  {form.isDefault && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <Star className="h-2.5 w-2.5" />
                      Default
                    </span>
                  )}
                </div>
                {form.name && (
                  <p className="font-mono text-xs text-zinc-500">{form.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="flex-1 space-y-5">
            {/* Section: Identity */}
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Identity
              </legend>

              <div>
                <Input
                  label="Display Name"
                  id="tier-display-name"
                  value={form.displayName}
                  onChange={(e) =>
                    updateFormField("displayName", e.target.value)
                  }
                  placeholder="e.g. Enterprise"
                  className={
                    formErrors.displayName
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }
                />
                {formErrors.displayName && (
                  <p className="mt-1 text-xs text-red-400">
                    {formErrors.displayName}
                  </p>
                )}
              </div>

              {!editingId && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label
                      htmlFor="tier-name"
                      className="text-sm font-medium text-zinc-300"
                    >
                      Slug
                    </label>
                    <span className="text-[10px] text-zinc-500">
                      (auto-generated)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0 text-zinc-500" />
                    <input
                      id="tier-name"
                      value={form.name}
                      onChange={(e) => updateFormField("name", e.target.value)}
                      placeholder="e.g. enterprise"
                      className={`w-full rounded-md border bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
                        formErrors.name
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500"
                      }`}
                    />
                  </div>
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-red-400">
                      {formErrors.name}
                    </p>
                  )}
                </div>
              )}

              <Input
                label="Description"
                id="tier-description"
                value={form.description}
                onChange={(e) => updateFormField("description", e.target.value)}
                placeholder="Brief description of the tier"
              />
            </fieldset>

            <hr className="border-zinc-800/60" />

            {/* Section: Appearance */}
            <fieldset>
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Appearance
              </legend>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <Palette className="h-3.5 w-3.5" />
                  Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => updateFormField("color", preset.hex)}
                      title={preset.label}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${
                        form.color.toLowerCase() === preset.hex
                          ? "scale-110 border-white shadow-lg"
                          : "border-zinc-700 hover:scale-105 hover:border-zinc-400"
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  ))}
                  <div className="ml-1 flex items-center gap-1.5">
                    <div
                      className="h-7 w-7 rounded-md border border-zinc-700"
                      style={{
                        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(form.color)
                          ? form.color
                          : "#71717a",
                      }}
                    />
                    <input
                      type="text"
                      value={form.color}
                      onChange={(e) => updateFormField("color", e.target.value)}
                      placeholder="#a855f7"
                      className={`w-24 rounded-md border bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
                        formErrors.color
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500"
                      }`}
                    />
                  </div>
                </div>
                {formErrors.color && (
                  <p className="mt-1 text-xs text-red-400">
                    {formErrors.color}
                  </p>
                )}
              </div>
            </fieldset>

            <hr className="border-zinc-800/60" />

            {/* Section: Configuration */}
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Configuration
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(e) =>
                      updateFormField(
                        "sortOrder",
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className={`w-full rounded-md border bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 ${
                      formErrors.sortOrder
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                        : "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500"
                    }`}
                  />
                  {formErrors.sortOrder && (
                    <p className="mt-1 text-xs text-red-400">
                      {formErrors.sortOrder}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                    <CreditCard className="h-3.5 w-3.5" />
                    Polar Product ID
                  </label>
                  <input
                    type="text"
                    value={form.polarProductId}
                    onChange={(e) =>
                      updateFormField("polarProductId", e.target.value)
                    }
                    placeholder="prod_..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">Optional</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) =>
                    updateFormField("isDefault", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-medium">Default tier</span>
                  <p className="text-xs text-zinc-500">
                    Auto-assigned to new users
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700">
                <input
                  type="checkbox"
                  checked={form.isComingSoon}
                  onChange={(e) =>
                    updateFormField("isComingSoon", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <span className="font-medium">Coming Soon</span>
                  <p className="text-xs text-zinc-500">
                    Disables the upgrade button on the pricing page
                  </p>
                </div>
              </label>
            </fieldset>
          </div>

          {/* Sticky footer */}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
            <Button
              variant="ghost"
              onClick={async () => {
                const allowed = await handleBeforeClose();
                if (allowed) setShowModal(false);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || (formTouched && hasErrors(formErrors))}
            >
              {saving ? "Saving..." : editingId ? "Update Tier" : "Create Tier"}
            </Button>
          </div>
        </div>
      </Drawer>

      {/* ==========================================
          SECTION 7: PAYMENT PRODUCTS
          ========================================== */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Payment Products
            </h2>
            <p className="text-xs text-zinc-400">
              Map payment provider product IDs to tiers. Supports multiple
              providers for easy migration.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                setSeedingProducts(true);
                try {
                  const result = await seedPaymentProducts({});
                  toast("success", result.message);
                } catch (err) {
                  toast(
                    "error",
                    err instanceof Error ? err.message : "Failed to seed"
                  );
                } finally {
                  setSeedingProducts(false);
                }
              }}
              size="sm"
              variant="ghost"
              disabled={seedingProducts}
            >
              {seedingProducts ? (
                <Spinner className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Sync from Tiers
            </Button>
            <Button
              onClick={() => {
                setEditingProductId(null);
                setProductForm({
                  tierName: tierDefs?.[0]?.name ?? "",
                  provider: "polar",
                  productId: "",
                  isActive: true,
                  label: "",
                });
                setShowProductModal(true);
              }}
              size="sm"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Product Mapping
            </Button>
          </div>
        </div>

        {!paymentProducts ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : paymentProducts.length === 0 ? (
          <Card className="py-8 text-center text-sm text-zinc-400">
            No payment product mappings configured.
            <br />
            <span className="text-xs">
              Add product IDs from your payment provider (Polar, Stripe, etc.)
              to link them to tiers.
            </span>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">
                    Tier
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">
                    Provider
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">
                    Product ID
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">
                    Label
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentProducts.map((product) => (
                  <tr
                    key={product._id}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        {product.tierName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {product.provider}
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                        {product.productId}
                      </code>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {product.label || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={async () => {
                          try {
                            await updatePaymentProduct({
                              id: product._id,
                              isActive: !product.isActive,
                            });
                            toast(
                              "success",
                              product.isActive
                                ? "Product deactivated"
                                : "Product activated"
                            );
                          } catch (err) {
                            toast(
                              "error",
                              err instanceof Error
                                ? err.message
                                : "Failed to toggle"
                            );
                          }
                        }}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                          product.isActive
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-zinc-700/50 text-zinc-500 hover:bg-zinc-700"
                        }`}
                      >
                        {product.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingProductId(product._id);
                            setProductForm({
                              tierName: product.tierName,
                              provider: product.provider,
                              productId: product.productId,
                              isActive: product.isActive,
                              label: product.label ?? "",
                            });
                            setShowProductModal(true);
                          }}
                          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Delete Product Mapping",
                              message: `Remove the ${product.provider} product mapping for tier "${product.tierName}"?`,
                              confirmLabel: "Delete",
                              variant: "danger",
                            });
                            if (!ok) return;
                            try {
                              await deletePaymentProduct({
                                id: product._id,
                              });
                              toast("success", "Product mapping deleted");
                            } catch (err) {
                              toast(
                                "error",
                                err instanceof Error
                                  ? err.message
                                  : "Failed to delete"
                              );
                            }
                          }}
                          className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Product Drawer */}
      <Drawer
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={
          editingProductId ? "Edit Product Mapping" : "Add Product Mapping"
        }
        width="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Tier
            </label>
            <select
              value={productForm.tierName}
              onChange={(e) =>
                setProductForm({ ...productForm, tierName: e.target.value })
              }
              disabled={!!editingProductId}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            >
              {tierDefs?.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.displayName} ({t.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Provider
            </label>
            <select
              value={productForm.provider}
              onChange={(e) =>
                setProductForm({ ...productForm, provider: e.target.value })
              }
              disabled={!!editingProductId}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="polar">Polar</option>
              {/* Add more providers here as needed */}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Product ID
            </label>
            <input
              type="text"
              value={productForm.productId}
              onChange={(e) =>
                setProductForm({ ...productForm, productId: e.target.value })
              }
              placeholder="prod_..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Label
            </label>
            <input
              type="text"
              value={productForm.label}
              onChange={(e) =>
                setProductForm({ ...productForm, label: e.target.value })
              }
              placeholder="e.g. Pro Monthly, Enterprise Annual"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700">
            <input
              type="checkbox"
              checked={productForm.isActive}
              onChange={(e) =>
                setProductForm({ ...productForm, isActive: e.target.checked })
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
            />
            Active
          </label>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={async () => {
                if (!productForm.productId.trim()) {
                  toast("error", "Product ID is required");
                  return;
                }
                setProductSaving(true);
                try {
                  if (editingProductId) {
                    await updatePaymentProduct({
                      id: editingProductId,
                      productId: productForm.productId,
                      isActive: productForm.isActive,
                      label: productForm.label || undefined,
                    });
                    toast("success", "Product mapping updated");
                  } else {
                    await createPaymentProduct({
                      tierName: productForm.tierName,
                      provider: productForm.provider,
                      productId: productForm.productId,
                      isActive: productForm.isActive,
                      label: productForm.label || undefined,
                    });
                    toast("success", "Product mapping created");
                  }
                  setShowProductModal(false);
                } catch (err) {
                  toast(
                    "error",
                    err instanceof Error ? err.message : "Failed to save"
                  );
                } finally {
                  setProductSaving(false);
                }
              }}
              disabled={productSaving}
              className="flex-1"
            >
              {productSaving ? (
                <Spinner className="h-4 w-4" />
              ) : editingProductId ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
            <Button variant="ghost" onClick={() => setShowProductModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ==========================================
// FEATURE CATEGORY GROUP
// ==========================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function FeatureCategoryGroup({
  category,
  features,
  totalCount,
  tierDefs,
  collapsed,
  onToggle,
  getOverrideValue,
  getEffectiveValue,
  handleMatrixChange,
  searchQuery,
}: {
  category: string;
  features: Array<{
    _id: string;
    key: string;
    displayName: string;
    valueType: string;
    defaultValue: string;
    _creationTime: number;
  }>;
  totalCount: number;
  tierDefs: Array<{ name: string; color?: string; displayName: string }>;
  collapsed: boolean;
  onToggle: () => void;
  getOverrideValue: (
    tierName: string,
    featureKey: string
  ) => string | undefined;
  getEffectiveValue: (
    tierName: string,
    featureKey: string,
    defaultValue: string
  ) => string;
  handleMatrixChange: (
    tierName: string,
    featureKey: string,
    value: string,
    defaultValue: string
  ) => void;
  searchQuery: string;
}) {
  const now = Date.now();
  const searchLower = searchQuery.toLowerCase();

  return (
    <>
      {/* Category header row */}
      <tr
        className="cursor-pointer border-b border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/30"
        onClick={onToggle}
      >
        <td colSpan={1 + tierDefs.length} className="px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {category}
            <span className="font-normal text-zinc-500">
              (
              {searchQuery
                ? `${features.length}/${totalCount}`
                : features.length}
              )
            </span>
          </div>
        </td>
      </tr>
      {/* Feature rows */}
      {!collapsed &&
        features.map((feature) => {
          const isNew = now - feature._creationTime < SEVEN_DAYS_MS;

          return (
            <tr
              key={feature._id}
              className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-300">
                    {searchQuery
                      ? highlightMatch(feature.displayName, searchLower)
                      : feature.displayName}
                  </span>
                  {isNew && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-blue-400 ring-1 ring-blue-500/30">
                      New
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {searchQuery
                    ? highlightMatch(feature.key, searchLower)
                    : feature.key}{" "}
                  <span className="text-zinc-600">({feature.valueType})</span>
                </div>
              </td>
              {tierDefs.map((td) => {
                const override = getOverrideValue(td.name, feature.key);
                const effective = getEffectiveValue(
                  td.name,
                  feature.key,
                  feature.defaultValue
                );
                const hasOverride = override !== undefined;

                return (
                  <td key={td.name} className="px-4 py-2.5 text-center">
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
          );
        })}
    </>
  );
}

// ==========================================
// HIGHLIGHT MATCH HELPER
// ==========================================

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded bg-emerald-500/20 text-emerald-300">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
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
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const isDirty = pendingValue !== null && pendingValue !== value;

  const handleConfirm = async () => {
    if (pendingValue === null) return;
    setSaving(true);
    try {
      await onChange(pendingValue);
    } finally {
      setSaving(false);
      setPendingValue(null);
    }
  };

  const handleCancel = () => {
    setPendingValue(null);
  };

  const displayValue = pendingValue ?? value;

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => setPendingValue(!displayValue)}
        disabled={saving}
        className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          displayValue ? "bg-emerald-600" : "bg-zinc-700"
        } ${isDirty ? "ring-2 ring-amber-500/50" : ""} disabled:opacity-50`}
        title={
          hasOverride
            ? "Tier override — click to toggle"
            : "Using default — click to toggle"
        }
      >
        <span
          className={`inline-block h-3 w-3 rounded-full transition-transform ${
            hasOverride || isDirty ? "bg-white" : "bg-zinc-400"
          } ${displayValue ? "translate-x-5" : "translate-x-1"}`}
        />
      </button>
      {isDirty && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="rounded p-0.5 text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
            title="Confirm change"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            title="Discard change"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
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
  const [draft, setDraft] = useState(isUnlimited ? "" : value);
  const [draftUnlimited, setDraftUnlimited] = useState(isUnlimited);
  const [saving, setSaving] = useState(false);

  // Sync draft when server value changes (and we're not mid-edit)
  const serverDisplay = isUnlimited ? "" : value;
  const prevServerRef = useState({ val: value })[0];
  if (prevServerRef.val !== value) {
    prevServerRef.val = value;
    if (!saving) {
      setDraft(serverDisplay);
      setDraftUnlimited(isUnlimited);
    }
  }

  // Determine if the current draft differs from the committed server value
  const draftValue = draftUnlimited ? "null" : draft.trim() || "null";
  const isDirty = draftValue !== value;

  const handleConfirm = async () => {
    if (!isDirty) return;
    // Validate before saving
    if (!draftUnlimited) {
      const trimmed = draft.trim();
      if (trimmed === "" || trimmed === "∞") {
        // Treat empty/infinity as unlimited
        setSaving(true);
        try {
          await onChange("null");
        } finally {
          setSaving(false);
        }
        return;
      }
      const n = parseInt(trimmed, 10);
      if (isNaN(n) || n < 0) return; // Invalid — do nothing
    }
    setSaving(true);
    try {
      await onChange(draftValue);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(serverDisplay);
    setDraftUnlimited(isUnlimited);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        type="text"
        value={draftUnlimited ? "" : draft}
        placeholder="∞"
        disabled={saving}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || v === "∞") {
            setDraft("");
            setDraftUnlimited(true);
          } else {
            // Allow only digits while typing
            if (/^\d*$/.test(v)) {
              setDraft(v);
              setDraftUnlimited(false);
            }
          }
        }}
        onKeyDown={handleKeyDown}
        className={`w-16 rounded border px-2 py-1 text-center text-xs transition-all ${
          isDirty
            ? "border-amber-500/60 bg-zinc-800 font-semibold text-zinc-100 ring-1 ring-amber-500/30"
            : hasOverride
              ? "border-emerald-600/50 bg-zinc-800 font-semibold text-zinc-100"
              : "border-zinc-700 bg-zinc-900 text-zinc-400"
        } focus:border-emerald-500 focus:outline-none disabled:opacity-50`}
      />
      <label className="flex items-center gap-0.5 text-[10px] text-zinc-500">
        <input
          type="checkbox"
          checked={draftUnlimited}
          disabled={saving}
          onChange={(e) => {
            setDraftUnlimited(e.target.checked);
            if (e.target.checked) {
              setDraft("");
            } else {
              setDraft(isUnlimited ? "0" : value);
            }
          }}
          className="h-3 w-3 rounded border-zinc-600 bg-zinc-800"
        />
        ∞
      </label>
      {isDirty && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="rounded p-0.5 text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
            title="Confirm (Enter)"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            title="Discard (Esc)"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
