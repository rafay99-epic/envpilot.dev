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
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Select";
import { QueryState } from "@/components/ui/QueryState";
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
  Loader2,
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
  /** Environment default for env-scopeable roles. Undefined = unrestricted. */
  environments?: string[];
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

const ENV_OPTIONS = ["development", "staging", "production"] as const;
const ENV_LABEL: Record<(typeof ENV_OPTIONS)[number], string> = {
  development: "dev",
  staging: "staging",
  production: "prod",
};

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
  /** Selected environment toggles. All three checked = unrestricted. */
  environments: string[];
}

const EMPTY_FORM: RoleFormData = {
  slug: "",
  displayName: "",
  description: "",
  color: "zinc",
  level: 10,
  sortOrder: 0,
  cloneFrom: "",
  environments: [...ENV_OPTIONS],
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
      environments: role.environments ?? [...ENV_OPTIONS],
    });
    setFormError(null);
    setDrawerMode("edit");
  };

  const toggleFormEnvironment = (env: string) => {
    setForm((prev) => ({
      ...prev,
      environments: prev.environments.includes(env)
        ? prev.environments.filter((e) => e !== env)
        : [...prev.environments, env],
    }));
    setFormError(null);
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

  const cloneSource = roles?.find((r) => r.slug === form.cloneFrom);
  const showEnvironmentToggles =
    drawerMode === "create"
      ? cloneSource?.capabilities["access.env_scoped"] === true
      : editingRole?.capabilities["access.env_scoped"] === true;

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
    if (showEnvironmentToggles && form.environments.length === 0) {
      setFormError(
        "Select at least one environment, or check all three for unrestricted access"
      );
      return;
    }
    // All three checked = unrestricted (send undefined/null, never the list).
    const unrestricted = form.environments.length === ENV_OPTIONS.length;
    setSaving(true);
    try {
      if (drawerMode === "create") {
        await createRole({
          slug: form.slug,
          displayName: form.displayName.trim(),
          description: form.description,
          color: form.color,
          level: form.level,
          capabilities: cloneSource ? { ...cloneSource.capabilities } : {},
          environments:
            showEnvironmentToggles && !unrestricted
              ? form.environments
              : undefined,
        });
        toast("success", `Role "${form.displayName}" created`);
      } else if (editingRole) {
        await updateRoleMeta({
          roleId: editingRole._id,
          // System-role identity is code-defined — only environment scope
          // (and, via the matrix, capabilities) is editable for those rows.
          ...(editingRole.isSystem
            ? {}
            : {
                displayName: form.displayName.trim(),
                description: form.description,
                color: form.color,
                sortOrder: form.sortOrder,
                level: form.level,
              }),
          ...(showEnvironmentToggles && {
            environments: unrestricted ? null : form.environments,
          }),
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
        key,
        granted,
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

  const levelClash =
    roles?.find(
      (r) => r.level === form.level && r.slug !== editingRole?.slug
    ) ?? null;

  const matrixData =
    roles && capabilities ? { roles, capabilities } : undefined;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Roles</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Create Role
        </Button>
      </div>

      {/* ==========================================
          SECTION 1: ROLE CARDS
          ========================================== */}
      <div className="mb-8">
        <QueryState
          data={roles}
          empty={{
            command: "seed-role-registry",
            message:
              "No roles in the registry. Run the seed-role-registry migration to create the system roles.",
          }}
        >
          {(loadedRoles) => (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {loadedRoles.map((role) => (
                <Card key={role._id} className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: colorHex(role.color),
                          boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 3px ${colorHex(role.color)}`,
                        }}
                      />
                      <h3 className="font-semibold text-ink">
                        {role.displayName}
                      </h3>
                      <Badge variant={role.isSystem ? "purple" : "default"}>
                        {role.isSystem ? "System" : "Custom"}
                      </Badge>
                      {!role.isActive && (
                        <Badge variant="danger">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(role)}
                        disabled={
                          role.isSystem &&
                          role.capabilities["access.env_scoped"] !== true
                        }
                        aria-label={
                          role.isSystem
                            ? role.capabilities["access.env_scoped"] === true
                              ? "Edit environment scope (identity is code-defined)"
                              : "System role identity is code-defined — only capabilities are editable in the matrix"
                            : "Edit role"
                        }
                        title={
                          role.isSystem
                            ? role.capabilities["access.env_scoped"] === true
                              ? "Edit environment scope — identity is code-defined, capabilities are editable in the matrix"
                              : "System role identity is code-defined — only capabilities are editable (in the matrix)"
                            : "Edit role"
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(role)}
                        disabled={role.isSystem || togglingId === role._id}
                        className={
                          role.isActive
                            ? "hover:text-warning"
                            : "hover:text-accent"
                        }
                        aria-label={
                          role.isSystem
                            ? "System roles cannot be deactivated"
                            : role.isActive
                              ? "Deactivate role"
                              : "Activate role"
                        }
                        title={
                          role.isSystem
                            ? "System roles cannot be deactivated"
                            : role.isActive
                              ? "Deactivate role"
                              : "Activate role"
                        }
                      >
                        {togglingId === role._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {role.description && (
                    <p className="mb-3 text-xs text-ink-muted">
                      {role.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-ink-muted">
                    <span className="font-mono text-ink-subtle">
                      {role.slug}
                    </span>
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
                    {role.capabilities["access.env_scoped"] === true && (
                      <span
                        className="font-mono text-ink-subtle"
                        title="Environment scope"
                      >
                        {role.environments
                          ? role.environments
                              .map(
                                (env) =>
                                  ENV_LABEL[
                                    env as (typeof ENV_OPTIONS)[number]
                                  ] ?? env
                              )
                              .join(", ")
                          : "all envs"}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      </div>

      {/* ==========================================
          SECTION 2: ROLE x CAPABILITY MATRIX
          ========================================== */}
      <div className="mb-8" data-wide>
        <h2 className="mb-1 text-lg font-semibold text-ink">
          Capability Matrix
        </h2>
        <p className="mb-4 text-xs text-ink-subtle">
          Toggles save immediately for every role except Owner (always locked,
          always holds everything). System-role edits survive deploys — new code
          defaults only fill in capabilities you haven&apos;t touched.
        </p>

        <QueryState data={matrixData} loadingLabel="loading matrix">
          {({ roles: matrixRoles, capabilities: matrixCapabilities }) => {
            const capabilitiesByCategory: Record<string, Capability[]> = {};
            for (const cap of matrixCapabilities) {
              (capabilitiesByCategory[cap.category] ??= []).push(cap);
            }
            return (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur-sm">
                      <th className="px-4 py-3 font-mono text-[0.68rem] font-medium uppercase tracking-wider text-ink-subtle">
                        Capability
                      </th>
                      <th className="px-4 py-3 font-mono text-[0.68rem] font-medium uppercase tracking-wider text-ink-subtle">
                        Risk
                      </th>
                      {matrixRoles.map((role) => (
                        <th
                          key={role._id}
                          className="px-4 py-3 text-center font-mono text-[0.68rem] font-medium uppercase tracking-wider text-ink-subtle"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: colorHex(role.color) }}
                            />
                            {role.displayName}
                            {role.slug === "owner" && (
                              <Lock
                                className="h-3 w-3 text-ink-subtle"
                                aria-label="Locked (owner always holds everything)"
                              />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {Object.entries(capabilitiesByCategory).map(
                      ([category, caps]) => (
                        <RoleCategoryGroup
                          key={category}
                          category={category}
                          caps={caps}
                          roles={matrixRoles}
                          savingCell={savingCell}
                          onToggle={handleCapabilityToggle}
                        />
                      )
                    )}
                  </tbody>
                </table>
              </div>
            );
          }}
        </QueryState>
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
              ? "System role: identity is code-defined. Capabilities are editable in the matrix (Owner excluded) and environment scope is editable below."
              : "Changes apply immediately to all members holding this role."
        }
        onClose={() => setDrawerMode(null)}
        width="max-w-lg"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-5">
            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                Identity
              </legend>

              <Input
                label="Display Name"
                id="role-display-name"
                value={form.displayName}
                onChange={(e) => updateFormField("displayName", e.target.value)}
                placeholder="e.g. Release Manager"
                disabled={editingRole?.isSystem ?? false}
              />

              {drawerMode === "create" && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label
                      htmlFor="role-slug"
                      className="flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      Slug
                    </label>
                    <span className="text-[10px] text-ink-subtle">
                      (auto-generated, immutable after creation)
                    </span>
                  </div>
                  <Input
                    id="role-slug"
                    value={form.slug}
                    onChange={(e) => updateFormField("slug", e.target.value)}
                    placeholder="e.g. release_manager"
                    className="font-mono"
                  />
                </div>
              )}

              <Input
                label="Description"
                id="role-description"
                value={form.description}
                onChange={(e) => updateFormField("description", e.target.value)}
                placeholder="What this role is for"
                disabled={editingRole?.isSystem ?? false}
              />
            </fieldset>

            <hr className="border-line" />

            <fieldset>
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                Appearance
              </legend>
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                <Palette className="h-3.5 w-3.5" />
                Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {ROLE_COLORS.map((preset) => (
                  <button
                    key={preset.token}
                    type="button"
                    onClick={() => updateFormField("color", preset.token)}
                    disabled={editingRole?.isSystem ?? false}
                    aria-label={`Color: ${preset.token}`}
                    aria-pressed={form.color === preset.token}
                    title={preset.token}
                    className={`h-7 w-7 rounded-full border-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      form.color === preset.token
                        ? "scale-110 border-white shadow-lg"
                        : "border-line hover:scale-105 hover:border-line-strong"
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                ))}
              </div>
            </fieldset>

            <hr className="border-line" />

            <fieldset className="space-y-4">
              <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                Hierarchy
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="role-level"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Level
                  </label>
                  <Input
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
                  />
                  <p className="mt-1 text-[10px] text-ink-subtle">
                    Higher = more authority. Invite/role-change rules compare
                    levels.
                  </p>
                  {levelClash && !editingRole?.isSystem && (
                    <p className="mt-1 text-xs text-warning">
                      Same level as &quot;{levelClash.displayName}&quot; —
                      allowed, but hierarchy comparisons treat them as peers.
                    </p>
                  )}
                </div>

                {drawerMode === "edit" && (
                  <Input
                    label="Sort Order"
                    id="role-sort-order"
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    disabled={editingRole?.isSystem ?? false}
                    onChange={(e) =>
                      updateFormField(
                        "sortOrder",
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                  />
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

            {showEnvironmentToggles && (
              <>
                <hr className="border-line" />
                <fieldset>
                  <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                    Environment Scope
                  </legend>
                  <p className="mb-2 text-[10px] text-ink-subtle">
                    All three checked = unrestricted. A member&apos;s own scope
                    can only narrow this default.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ENV_OPTIONS.map((env) => {
                      const checked = form.environments.includes(env);
                      return (
                        <button
                          key={env}
                          type="button"
                          onClick={() => toggleFormEnvironment(env)}
                          aria-pressed={checked}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            checked
                              ? "border-accent bg-accent-soft text-ink"
                              : "border-line text-ink-subtle hover:border-line-strong"
                          }`}
                        >
                          {env}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}

            {formError && <p className="text-xs text-danger">{formError}</p>}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
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
      <tr className="bg-surface/60">
        <td
          colSpan={2 + roles.length}
          className="px-4 py-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          {category}
        </td>
      </tr>
      {caps.map((cap) => (
        <tr key={cap.key} className="transition-colors hover:bg-accent-soft">
          <td className="px-4 py-2">
            <div className="text-xs text-ink-muted" title={cap.description}>
              {cap.label}
            </div>
            <div className="font-mono text-[10px] text-ink-subtle">
              {cap.key}
            </div>
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
                {role.slug === "owner" ? (
                  granted ? (
                    <Check className="mx-auto h-3.5 w-3.5 text-accent/70" />
                  ) : (
                    <span className="text-ink-faint">&mdash;</span>
                  )
                ) : (
                  <input
                    type="checkbox"
                    checked={granted}
                    disabled={savingCell === cellId}
                    onChange={(e) => onToggle(role, cap.key, e.target.checked)}
                    aria-label={`${role.displayName}: ${cap.label}`}
                    title={`${role.displayName}: ${cap.label}`}
                    className="h-4 w-4 rounded border-line-strong bg-surface-raised text-accent focus:ring-accent-line disabled:opacity-50"
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
