import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  Plus,
  Pencil,
  Lock,
  Check,
  Users,
  Mail,
  Palette,
  Power,
  Layers,
  Tag,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/roles")({
  component: RolesPage,
});

// ==========================================
// TYPES & CONSTANTS
// ==========================================

interface Role {
  _id: Id<"roleRegistry">;
  slug: string;
  displayName: string;
  description: string;
  color: string;
  level: number;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  capabilities: Record<string, boolean>;
  memberCount: number;
  pendingInvitationCount: number;
}

interface Capability {
  key: string;
  label: string;
  category: string;
  description: string;
  risk: string;
}

/** Badge color tokens stored on roleRegistry rows (web maps to its palette) */
const ROLE_COLORS: { token: string; hex: string }[] = [
  { token: "purple", hex: "#a855f7" },
  { token: "amber", hex: "#f59e0b" },
  { token: "blue", hex: "#3b82f6" },
  { token: "teal", hex: "#14b8a6" },
  { token: "zinc", hex: "#71717a" },
  { token: "slate", hex: "#64748b" },
  { token: "green", hex: "#22c55e" },
  { token: "red", hex: "#ef4444" },
];

function colorHex(token: string): string {
  return ROLE_COLORS.find((c) => c.token === token)?.hex ?? "#71717a";
}

const RISK_VARIANT: Record<string, "danger" | "warning" | "info" | "default"> =
  {
    critical: "danger",
    high: "warning",
    medium: "info",
    low: "default",
  };

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/;

/** ConvexError payloads survive prod redaction; plain Error.message does not */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) return String(err.data);
  return err instanceof Error ? err.message : fallback;
}

interface RoleFormData {
  slug: string;
  displayName: string;
  description: string;
  color: string;
  level: number;
  sortOrder: number;
  cloneFrom: string;
}

const EMPTY_FORM: RoleFormData = {
  slug: "",
  displayName: "",
  description: "",
  color: "zinc",
  level: 10,
  sortOrder: 0,
  cloneFrom: "",
};

// ==========================================
// MAIN PAGE
// ==========================================

function RolesPage() {
  const roles = useAdminQuery(api.features.admin.roles.listRoles, {}) as
    | Role[]
    | undefined;
  const capabilities = useAdminQuery(
    api.features.admin.roles.listCapabilities,
    {}
  ) as Capability[] | undefined;

  const createRole = useAdminMutation(api.features.admin.roles.createRole);
  const updateRoleMeta = useAdminMutation(
    api.features.admin.roles.updateRoleMeta
  );
  const updateRoleCapabilities = useAdminMutation(
    api.features.admin.roles.updateRoleCapabilities
  );
  const setRoleActive = useAdminMutation(
    api.features.admin.roles.setRoleActive
  );
  const { confirm } = useConfirmStore();

  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ==========================================
  // DRAWER OPEN/SAVE
  // ==========================================

  const openCreate = () => {
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerMode("create");
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setForm({
      slug: role.slug,
      displayName: role.displayName,
      description: role.description,
      color: role.color,
      level: role.level,
      sortOrder: role.sortOrder,
      cloneFrom: "",
    });
    setFormError(null);
    setDrawerMode("edit");
  };

  const updateFormField = <K extends keyof RoleFormData>(
    field: K,
    value: RoleFormData[K]
  ) => {
    const next = { ...form, [field]: value };
    // Auto-generate slug from display name when creating
    if (field === "displayName" && drawerMode === "create") {
      next.slug = (value as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    }
    setForm(next);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.displayName.trim()) {
      setFormError("Display name is required");
      return;
    }
    if (drawerMode === "create" && !SLUG_PATTERN.test(form.slug)) {
      setFormError(
        "Slug must start with a letter and contain only lowercase letters, digits, and underscores (2-31 chars)"
      );
      return;
    }
    setSaving(true);
    try {
      if (drawerMode === "create") {
        const cloneSource = roles?.find((r) => r.slug === form.cloneFrom);
        await createRole({
          slug: form.slug,
          displayName: form.displayName.trim(),
          description: form.description,
          color: form.color,
          level: form.level,
          capabilities: cloneSource ? { ...cloneSource.capabilities } : {},
        });
        toast("success", `Role "${form.displayName}" created`);
      } else if (editingRole) {
        await updateRoleMeta({
          roleId: editingRole._id,
          displayName: form.displayName.trim(),
          description: form.description,
          color: form.color,
          sortOrder: form.sortOrder,
          ...(editingRole.isSystem ? {} : { level: form.level }),
        });
        toast("success", `Role "${form.displayName}" updated`);
      }
      setDrawerMode(null);
    } catch (err) {
      toast("error", errMsg(err, "Failed to save role"));
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // TOGGLES
  // ==========================================

  const handleToggleActive = async (role: Role) => {
    if (role.isActive) {
      const inUse = role.memberCount > 0 || role.pendingInvitationCount > 0;
      const ok = await confirm({
        title: "Deactivate Role",
        message: inUse
          ? `"${role.displayName}" is held by ${role.memberCount} member(s) and ${role.pendingInvitationCount} pending invitation(s) — deactivation will be blocked.`
          : `Inactive roles can no longer be assigned to members or invitations. "${role.displayName}" can be reactivated at any time.`,
        confirmLabel: "Deactivate",
        variant: "warning",
      });
      if (!ok) return;
    }
    setTogglingId(role._id);
    try {
      await setRoleActive({ roleId: role._id, isActive: !role.isActive });
      toast(
        "success",
        `"${role.displayName}" ${role.isActive ? "deactivated" : "activated"}`
      );
    } catch (err) {
      toast("error", errMsg(err, "Failed to update role"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleCapabilityToggle = async (
    role: Role,
    key: string,
    granted: boolean
  ) => {
    const cellId = `${role._id}:${key}`;
    setSavingCell(cellId);
    try {
      await updateRoleCapabilities({
        roleId: role._id,
        capabilities: { ...role.capabilities, [key]: granted },
      });
      toast(
        "success",
        `${role.displayName}: "${key}" ${granted ? "granted" : "revoked"}`
      );
    } catch (err) {
      toast("error", errMsg(err, "Failed to update capabilities"));
    } finally {
      setSavingCell(null);
    }
  };

  // ==========================================
  // DERIVED
  // ==========================================

  const capabilitiesByCategory: Record<string, Capability[]> = {};
  if (capabilities) {
    for (const cap of capabilities) {
      (capabilitiesByCategory[cap.category] ??= []).push(cap);
    }
  }

  const levelClash =
    roles?.find(
      (r) => r.level === form.level && r.slug !== editingRole?.slug
    ) ?? null;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Roles</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Create Role
        </Button>
      </div>

      {/* ==========================================
          SECTION 1: ROLE CARDS
          ========================================== */}
      <div className="mb-8">
        {!roles ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-zinc-400">
              No roles in the registry. Run the seed-role-registry migration to
              create the system roles.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <Card key={role._id} className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: colorHex(role.color),
                        boxShadow: `0 0 0 2px var(--color-zinc-900), 0 0 0 3px ${colorHex(role.color)}`,
                      }}
                    />
                    <h3 className="font-semibold text-zinc-100">
                      {role.displayName}
                    </h3>
                    <Badge variant={role.isSystem ? "purple" : "default"}>
                      {role.isSystem ? "System" : "Custom"}
                    </Badge>
                    {!role.isActive && <Badge variant="danger">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(role)}
                      className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      title="Edit role"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(role)}
                      disabled={role.isSystem || togglingId === role._id}
                      className={`rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 ${
                        role.isActive
                          ? "hover:text-amber-400"
                          : "hover:text-emerald-400"
                      }`}
                      title={
                        role.isSystem
                          ? "System roles cannot be deactivated"
                          : role.isActive
                            ? "Deactivate role"
                            : "Activate role"
                      }
                    >
                      {togglingId === role._id ? (
                        <Spinner />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {role.description && (
                  <p className="mb-3 text-xs text-zinc-400">
                    {role.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span className="font-mono text-zinc-500">{role.slug}</span>
                  <span className="flex items-center gap-1" title="Level">
                    <Layers className="h-3 w-3" />
                    {role.level}
                  </span>
                  <span className="flex items-center gap-1" title="Members">
                    <Users className="h-3 w-3" />
                    {role.memberCount}
                  </span>
                  {role.pendingInvitationCount > 0 && (
                    <span
                      className="flex items-center gap-1"
                      title="Pending invitations"
                    >
                      <Mail className="h-3 w-3" />
                      {role.pendingInvitationCount}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ==========================================
          SECTION 2: ROLE x CAPABILITY MATRIX
          ========================================== */}
      <div className="mb-8">
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">
          Capability Matrix
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Toggles save immediately. System role columns are locked — their
          capability matrices are code-defined.
        </p>

        {!roles || !capabilities ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">
                    Capability
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">
                    Risk
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role._id}
                      className="px-4 py-3 text-center text-xs font-medium text-zinc-400"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorHex(role.color) }}
                        />
                        {role.displayName}
                        {role.isSystem && (
                          <Lock
                            className="h-3 w-3 text-zinc-500"
                            aria-label="Locked (system role)"
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(capabilitiesByCategory).map(
                  ([category, caps]) => (
                    <RoleCategoryGroup
                      key={category}
                      category={category}
                      caps={caps}
                      roles={roles}
                      savingCell={savingCell}
                      onToggle={handleCapabilityToggle}
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==========================================
          CREATE / EDIT DRAWER
          ========================================== */}
      <Drawer
        isOpen={drawerMode !== null}
        title={drawerMode === "create" ? "Create Role" : "Edit Role"}
        description={
          drawerMode === "create"
            ? "Custom roles are platform-global and editable from this panel."
            : editingRole?.isSystem
              ? "System role: level and capabilities are code-defined."
              : "Changes apply immediately to all members holding this role."
        }
        onClose={() => setDrawerMode(null)}
        width="max-w-lg"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-5">
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Identity
              </legend>

              <Input
                label="Display Name"
                id="role-display-name"
                value={form.displayName}
                onChange={(e) => updateFormField("displayName", e.target.value)}
                placeholder="e.g. Release Manager"
              />

              {drawerMode === "create" && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label
                      htmlFor="role-slug"
                      className="text-sm font-medium text-zinc-300"
                    >
                      Slug
                    </label>
                    <span className="text-[10px] text-zinc-500">
                      (auto-generated, immutable after creation)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0 text-zinc-500" />
                    <input
                      id="role-slug"
                      value={form.slug}
                      onChange={(e) => updateFormField("slug", e.target.value)}
                      placeholder="e.g. release_manager"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <Input
                label="Description"
                id="role-description"
                value={form.description}
                onChange={(e) => updateFormField("description", e.target.value)}
                placeholder="What this role is for"
              />
            </fieldset>

            <hr className="border-zinc-800/60" />

            <fieldset>
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Appearance
              </legend>
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                <Palette className="h-3.5 w-3.5" />
                Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {ROLE_COLORS.map((preset) => (
                  <button
                    key={preset.token}
                    onClick={() => updateFormField("color", preset.token)}
                    title={preset.token}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      form.color === preset.token
                        ? "scale-110 border-white shadow-lg"
                        : "border-zinc-700 hover:scale-105 hover:border-zinc-400"
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                ))}
              </div>
            </fieldset>

            <hr className="border-zinc-800/60" />

            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Hierarchy
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="role-level"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-300"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Level
                  </label>
                  <input
                    id="role-level"
                    type="number"
                    value={form.level}
                    disabled={editingRole?.isSystem ?? false}
                    onChange={(e) =>
                      updateFormField(
                        "level",
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Higher = more authority. Invite/role-change rules compare
                    levels.
                  </p>
                  {levelClash && !editingRole?.isSystem && (
                    <p className="mt-1 text-xs text-amber-400">
                      Same level as &quot;{levelClash.displayName}&quot; —
                      allowed, but hierarchy comparisons treat them as peers.
                    </p>
                  )}
                </div>

                {drawerMode === "edit" && (
                  <div>
                    <label
                      htmlFor="role-sort-order"
                      className="mb-1.5 block text-sm font-medium text-zinc-300"
                    >
                      Sort Order
                    </label>
                    <input
                      id="role-sort-order"
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={(e) =>
                        updateFormField(
                          "sortOrder",
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>

              {drawerMode === "create" && (
                <Select
                  label="Clone capabilities from"
                  id="role-clone-from"
                  value={form.cloneFrom}
                  onChange={(e) => updateFormField("cloneFrom", e.target.value)}
                  options={[
                    { value: "", label: "None (start empty)" },
                    ...(roles ?? []).map((r) => ({
                      value: r.slug,
                      label: r.displayName,
                    })),
                  ]}
                />
              )}
            </fieldset>

            {formError && <p className="text-xs text-red-400">{formError}</p>}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
            <Button
              variant="ghost"
              onClick={() => setDrawerMode(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Saving..."
                : drawerMode === "create"
                  ? "Create Role"
                  : "Update Role"}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ==========================================
// MATRIX CATEGORY GROUP
// ==========================================

function RoleCategoryGroup({
  category,
  caps,
  roles,
  savingCell,
  onToggle,
}: {
  category: string;
  caps: Capability[];
  roles: Role[];
  savingCell: string | null;
  onToggle: (role: Role, key: string, granted: boolean) => void;
}) {
  return (
    <>
      <tr className="border-b border-zinc-800 bg-zinc-900/60">
        <td
          colSpan={2 + roles.length}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400"
        >
          {category}
        </td>
      </tr>
      {caps.map((cap) => (
        <tr
          key={cap.key}
          className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
        >
          <td className="px-4 py-2">
            <div className="text-xs text-zinc-300" title={cap.description}>
              {cap.label}
            </div>
            <div className="font-mono text-[10px] text-zinc-500">{cap.key}</div>
          </td>
          <td className="px-4 py-2">
            <Badge variant={RISK_VARIANT[cap.risk] ?? "default"}>
              {cap.risk}
            </Badge>
          </td>
          {roles.map((role) => {
            const granted = role.capabilities[cap.key] === true;
            const cellId = `${role._id}:${cap.key}`;
            return (
              <td key={role._id} className="px-4 py-2 text-center">
                {role.isSystem ? (
                  granted ? (
                    <Check className="mx-auto h-3.5 w-3.5 text-emerald-500/70" />
                  ) : (
                    <span className="text-zinc-600">&mdash;</span>
                  )
                ) : (
                  <input
                    type="checkbox"
                    checked={granted}
                    disabled={savingCell === cellId}
                    onChange={(e) => onToggle(role, cap.key, e.target.checked)}
                    title={`${role.displayName}: ${cap.label}`}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
                  />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
