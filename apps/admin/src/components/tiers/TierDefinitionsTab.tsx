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
import { QueryState } from "@/components/ui/QueryState";
import { toast } from "@/components/ui/Toast";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  Users,
  Palette,
  CreditCard,
  ArrowUpDown,
  Tag,
} from "lucide-react";

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

export function TierDefinitionsTab() {
  const tierDefs = useAdminQuery(
    api.features.admin.tiers.listTierDefinitions,
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
  const seedTiers = useAdminMutation(api.features.admin.tiers.seedDefaultTiers);
  const { confirm } = useConfirmStore();

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
          // Send the raw string (even "") on update: these are optional
          // string fields in the schema, so "" is a valid value meaning
          // "clear it". Mapping "" -> undefined here would make a cleared
          // field indistinguishable from an untouched one on the backend.
          description: form.description,
          sortOrder: form.sortOrder,
          isDefault: form.isDefault,
          isComingSoon: form.isComingSoon,
          color: form.color,
          polarProductId: form.polarProductId,
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

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">
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

      <QueryState
        data={tierDefs}
        empty={{
          message:
            'No tier definitions yet. Click "Seed Defaults" to create the standard free and pro tiers, or add a custom tier.',
        }}
      >
        {(tiers) => (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {tiers.map((tier) => {
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
                          boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 3px ${tier.color ?? "#71717a"}`,
                        }}
                      />
                      <h3 className="font-semibold text-ink">
                        {tier.displayName}
                      </h3>
                      <Badge
                        variant={tier.name === "pro" ? "purple" : "default"}
                      >
                        {tier.name}
                      </Badge>
                      {tier.isDefault && (
                        <span className="flex items-center gap-1 text-xs text-warning">
                          <Star className="h-3 w-3" />
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(tier)}
                        aria-label={`Edit ${tier.displayName}`}
                        className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                        title="Edit tier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tier._id)}
                        disabled={!canDelete}
                        aria-label={`Delete ${tier.displayName}`}
                        className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
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
                    <p className="mb-3 text-xs text-ink-muted">
                      {tier.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {userCount} user{userCount !== 1 ? "s" : ""}
                    </span>
                    {tier.polarProductId && (
                      <span
                        className="flex items-center gap-1 text-ink-subtle"
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
      </QueryState>

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
          <div className="mb-6 rounded-lg border border-line bg-surface/50 p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
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
                  <span className="text-sm font-semibold text-ink">
                    {form.displayName || "Tier Name"}
                  </span>
                  {form.isDefault && (
                    <span className="flex items-center gap-0.5 text-[10px] text-warning">
                      <Star className="h-2.5 w-2.5" />
                      Default
                    </span>
                  )}
                </div>
                {form.name && (
                  <p className="font-mono text-xs text-ink-subtle">{form.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="flex-1 space-y-5">
            {/* Section: Identity */}
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
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
                      ? "border-danger-line focus:border-danger-line focus:ring-danger-line"
                      : ""
                  }
                />
                {formErrors.displayName && (
                  <p className="mt-1 text-xs text-danger">
                    {formErrors.displayName}
                  </p>
                )}
              </div>

              {!editingId && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label
                      htmlFor="tier-name"
                      className="text-sm font-medium text-ink-muted"
                    >
                      Slug
                    </label>
                    <span className="text-[10px] text-ink-subtle">
                      (auto-generated)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0 text-ink-subtle" />
                    <input
                      id="tier-name"
                      value={form.name}
                      onChange={(e) => updateFormField("name", e.target.value)}
                      placeholder="e.g. enterprise"
                      className={`w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 ${
                        formErrors.name
                          ? "border-danger-line focus:border-danger-line focus:ring-danger-line"
                          : "border-line focus:border-accent-line focus:ring-accent-line"
                      }`}
                    />
                  </div>
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-danger">
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

            <hr className="border-line" />

            {/* Section: Appearance */}
            <fieldset>
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                Appearance
              </legend>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                  <Palette className="h-3.5 w-3.5" />
                  Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => updateFormField("color", preset.hex)}
                      title={preset.label}
                      aria-label={`Set color ${preset.label}`}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${
                        form.color.toLowerCase() === preset.hex
                          ? "scale-110 border-white shadow-lg"
                          : "border-line hover:scale-105 hover:border-line-strong"
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  ))}
                  <div className="ml-1 flex items-center gap-1.5">
                    <div
                      className="h-7 w-7 rounded-md border border-line"
                      style={{
                        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(form.color)
                          ? form.color
                          : "#71717a",
                      }}
                    />
                    <input
                      type="text"
                      value={form.color}
                      aria-label="Custom hex color"
                      onChange={(e) => updateFormField("color", e.target.value)}
                      placeholder="#a855f7"
                      className={`w-24 rounded-md border bg-surface px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 ${
                        formErrors.color
                          ? "border-danger-line focus:border-danger-line focus:ring-danger-line"
                          : "border-line focus:border-accent-line focus:ring-accent-line"
                      }`}
                    />
                  </div>
                </div>
                {formErrors.color && (
                  <p className="mt-1 text-xs text-danger">
                    {formErrors.color}
                  </p>
                )}
              </div>
            </fieldset>

            <hr className="border-line" />

            {/* Section: Configuration */}
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                Configuration
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="tier-sort-order"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Sort Order
                  </label>
                  <input
                    id="tier-sort-order"
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(e) =>
                      updateFormField(
                        "sortOrder",
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className={`w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 ${
                      formErrors.sortOrder
                        ? "border-danger-line focus:border-danger-line focus:ring-danger-line"
                        : "border-line focus:border-accent-line focus:ring-accent-line"
                    }`}
                  />
                  {formErrors.sortOrder && (
                    <p className="mt-1 text-xs text-danger">
                      {formErrors.sortOrder}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="tier-polar-id"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Polar Product ID
                  </label>
                  <input
                    id="tier-polar-id"
                    type="text"
                    value={form.polarProductId}
                    onChange={(e) =>
                      updateFormField("polarProductId", e.target.value)
                    }
                    placeholder="prod_..."
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line"
                  />
                  <p className="mt-1 text-[10px] text-ink-subtle">Optional</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface/50 px-3 py-2.5 text-sm text-ink-muted transition-colors hover:border-line">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) =>
                    updateFormField("isDefault", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-line-strong bg-surface-raised text-accent focus:ring-accent-line"
                />
                <div>
                  <span className="font-medium">Default tier</span>
                  <p className="text-xs text-ink-subtle">
                    Auto-assigned to new users
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface/50 px-3 py-2.5 text-sm text-ink-muted transition-colors hover:border-line">
                <input
                  type="checkbox"
                  checked={form.isComingSoon}
                  onChange={(e) =>
                    updateFormField("isComingSoon", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-line-strong bg-surface-raised text-warning focus:ring-warning-line"
                />
                <div>
                  <span className="font-medium">Coming Soon</span>
                  <p className="text-xs text-ink-subtle">
                    Disables the upgrade button on the pricing page
                  </p>
                </div>
              </label>
            </fieldset>
          </div>

          {/* Sticky footer */}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
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
    </section>
  );
}
