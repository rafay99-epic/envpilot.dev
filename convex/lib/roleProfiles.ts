/**
 * Built-in role profiles — the dual-mode resolver's fallback and the
 * source of the seeded system roles.
 *
 * PARITY CONTRACT: the four system profiles below must reproduce the exact
 * pre-registry behavior of convex/lib/authz.ts (its ORG_ACTIONS /
 * PROJECT_ACTIONS maps and the role branches in getVariableAccess /
 * getAccountAccess). The golden parity tests
 * (apps/web/src/lib/__tests__/role-parity.test.ts) assert this — any drift
 * is a test failure, not a silent policy change.
 *
 * This module is PURE (no ctx, no _generated imports) so it can be unit
 * tested and imported by seeds, the resolver, and the parity suite alike.
 */

import {
  type CapabilityKey,
  type CapabilityMap,
  type OrgAction,
  type ProjectAction,
  CAPABILITY_KEYS,
  ORG_ACTION_TO_CAPABILITY,
  PROJECT_ACTION_TO_CAPABILITY,
} from "./capabilities";

export interface RoleProfile {
  slug: string;
  displayName: string;
  description: string;
  color: string;
  /** Hierarchy: higher = more authority. Strictly-below rules compare this. */
  level: number;
  isSystem: boolean;
  capabilities: CapabilityMap;
}

function caps(keys: CapabilityKey[]): CapabilityMap {
  const map: CapabilityMap = {};
  for (const key of keys) map[key] = true;
  return map;
}

/**
 * The owner holds every capability, by construction. Derived from the
 * catalog rather than listed by hand: a capability shipped without being
 * added here would have silently left the owner unable to use their own
 * organization until someone noticed.
 */
const OWNER_EXCLUDED: CapabilityKey[] = [
  // Owners create directly; they never file a request with themselves.
  "project.requests.submit",
];

const ALL_CAPABILITY_KEYS: CapabilityKey[] = CAPABILITY_KEYS.filter(
  // access.* are scope MODIFIERS, not grants — an owner that carried
  // access.env_scoped would be narrowing itself.
  (key) => !key.startsWith("access.") && !OWNER_EXCLUDED.includes(key)
);

export const SYSTEM_PROFILES: Record<string, RoleProfile> = {
  owner: {
    slug: "owner",
    displayName: "Owner",
    description: "Full control over the organization and every project",
    color: "purple",
    level: 100,
    isSystem: true,
    capabilities: caps(ALL_CAPABILITY_KEYS),
  },
  project_manager: {
    slug: "project_manager",
    displayName: "Project Manager",
    description:
      "Full control over their assigned projects; manages team leads and developers",
    color: "amber",
    level: 80,
    isSystem: true,
    capabilities: caps([
      "org.members.invite",
      "org.members.remove",
      "org.sessions",
      "org.projects.create",
      "org.clients.link",
      "org.tags.create",
      "org.tags.manage",
      "org.audit.view",
      "project.read",
      "project.update",
      "project.variables.create",
      "project.variables.update",
      "project.variables.delete",
      "project.accounts.create",
      "project.accounts.update",
      "project.accounts.delete",
      "project.files.create",
      "project.docs.create",
      "project.docs.update",
      "project.docs.publish",
      "project.docs.delete",
      "project.files.update",
      "project.files.delete",
      "project.secrets.reveal",
      "project.requests.review",
      "project.permissions.manage",
      "project.members.manage",
      "project.share",
      "project.templates.manage",
      "notify.variable_changes",
    ]),
  },
  team_lead: {
    slug: "team_lead",
    displayName: "Team Lead",
    description:
      "Manages variables and developer access in their assigned projects",
    color: "blue",
    level: 60,
    isSystem: true,
    capabilities: caps([
      "org.members.invite",
      "org.clients.link",
      "org.tags.create",
      "org.tags.manage",
      "org.audit.view",
      "project.read",
      "project.variables.create",
      "project.variables.update",
      "project.variables.delete",
      "project.accounts.create",
      "project.accounts.update",
      "project.accounts.delete",
      "project.files.create",
      "project.docs.create",
      "project.docs.update",
      "project.docs.publish",
      "project.docs.delete",
      "project.files.update",
      "project.files.delete",
      "project.secrets.reveal",
      "project.requests.review",
      "project.permissions.manage",
      "project.members.manage",
      "project.share",
      "project.templates.manage",
      "notify.variable_changes",
    ]),
  },
  developer: {
    slug: "developer",
    displayName: "Developer",
    description:
      "Works in assigned projects; variable values require explicit access grants",
    color: "zinc",
    level: 40,
    isSystem: true,
    capabilities: caps([
      "org.clients.link",
      "org.tags.create",
      "project.read",
      // MAIN PARITY: developers CAN create variables/accounts directly today
      // (they receive an auto write-grant on creation). The request-only
      // lockdown policy is a profile edit made from the admin panel later —
      // not a hardcoded rule.
      "project.variables.create",
      "project.accounts.create",
      "project.files.create",
      "project.docs.create",
      "project.requests.submit",
      "project.share",
      "access.grant_fallback",
      "access.env_scoped",
    ]),
  },
};

/**
 * Non-system seeded roles — the #127 semantics, expressed as data. Editable
 * (and deactivatable while unused) from the admin panel.
 */
export const SEEDED_CUSTOM_PROFILES: Record<string, RoleProfile> = {
  editor: {
    slug: "editor",
    displayName: "Editor",
    description:
      "Creates and edits variables and accounts in assigned projects; no member, permission, approval, or sharing powers",
    color: "teal",
    level: 50,
    isSystem: false,
    capabilities: caps([
      "org.clients.link",
      "org.tags.create",
      "project.read",
      "project.variables.create",
      "project.variables.update",
      "project.variables.delete",
      "project.accounts.create",
      "project.accounts.update",
      "project.accounts.delete",
      "project.files.create",
      "project.docs.create",
      "project.docs.update",
      "project.docs.publish",
      "project.files.update",
      "project.files.delete",
      "project.secrets.reveal",
      "notify.variable_changes",
      "access.env_scoped",
    ]),
  },
  viewer: {
    slug: "viewer",
    displayName: "Viewer",
    description:
      "Sees everything in assigned projects; cannot change, request, or share anything",
    color: "slate",
    level: 20,
    isSystem: false,
    capabilities: caps([
      "org.clients.link",
      "project.read",
      "access.blanket_read",
      "access.env_scoped",
    ]),
  },
};

/** True when the profile grants the capability. Missing = false (fail closed). */
/**
 * Owner capabilities always come from code, never from the stored row.
 * The seed force-syncs owner, but between a deploy that adds a capability
 * and the seed that lands it the stored map is short by exactly the new
 * key — and that gap is an owner locked out of a feature they paid for.
 */
export function resolveCapabilities(
  slug: string,
  stored: CapabilityMap
): CapabilityMap {
  return slug === "owner" ? SYSTEM_PROFILES.owner.capabilities : stored;
}

export function hasCapability(
  profile: Pick<RoleProfile, "capabilities">,
  key: CapabilityKey
): boolean {
  return profile.capabilities[key] === true;
}

/**
 * Expand a profile into the legacy action-string sets — the shape
 * getMyPermissions serves to the web app and the parity suite asserts
 * against the pre-registry ORG_ACTIONS / PROJECT_ACTIONS maps.
 */
export function expandActions(profile: Pick<RoleProfile, "capabilities">): {
  orgActions: OrgAction[];
  projectActions: ProjectAction[];
} {
  const orgActions = (
    Object.keys(ORG_ACTION_TO_CAPABILITY) as OrgAction[]
  ).filter((action) =>
    hasCapability(profile, ORG_ACTION_TO_CAPABILITY[action])
  );
  const projectActions = (
    Object.keys(PROJECT_ACTION_TO_CAPABILITY) as ProjectAction[]
  ).filter((action) =>
    hasCapability(profile, PROJECT_ACTION_TO_CAPABILITY[action])
  );
  return { orgActions, projectActions };
}

/**
 * Merge-seed semantics for system-role capability sync (owner excluded —
 * owner is always fully code-synced). Code defaults fill keys the stored
 * row has never seen (new features arrive enabled per code); keys already
 * present on the stored row keep their stored value (admin-panel edits
 * survive every deploy). Stored keys no longer in the catalog are dropped.
 *
 * Consequence: REMOVING a default from code does not propagate to rows
 * that already carry the key — retirements are panel actions or one-off
 * migrations, never silent seed effects.
 */
export function mergeSystemRoleCapabilities(
  codeDefaults: CapabilityMap,
  stored: Record<string, boolean>
): CapabilityMap {
  const merged: CapabilityMap = { ...codeDefaults };
  for (const [key, value] of Object.entries(stored)) {
    // Catalog membership only — `key in codeDefaults` would walk the
    // prototype chain and admit junk keys like "toString".
    if ((CAPABILITY_KEYS as string[]).includes(key)) {
      merged[key as CapabilityKey] = value;
    }
  }
  return merged;
}

/**
 * Fail-closed profile for an unknown role slug: zero capabilities, lowest
 * level. Reaching this means registry data is inconsistent (the admin panel
 * blocks deactivating/deleting roles that still have members) — for a
 * secrets manager, lock-out beats leak.
 */
export const UNKNOWN_ROLE_PROFILE: RoleProfile = {
  slug: "__unknown__",
  displayName: "Unknown role",
  description: "Role slug not found in the registry — access denied",
  color: "zinc",
  level: 0,
  isSystem: false,
  capabilities: {},
};
