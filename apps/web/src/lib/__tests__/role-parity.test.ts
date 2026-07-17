// GOLDEN PARITY SUITE — the regression fence for the role registry.
//
// The EXPECTED_* fixtures below are a frozen snapshot of the pre-registry
// authorization matrix (convex/lib/authz.ts ORG_ACTIONS / PROJECT_ACTIONS on
// main @ d908d4ff) plus the access-decision behavior of getVariableAccess /
// getAccountAccess. The seeded system profiles MUST reproduce them exactly.
// A failure here means the registry changed policy — which is only ever
// allowed as a deliberate, admin-panel-visible profile edit, never as a
// side effect of code changes.
import { describe, expect, it } from "vitest";

import {
  SYSTEM_PROFILES,
  SEEDED_CUSTOM_PROFILES,
  UNKNOWN_ROLE_PROFILE,
  expandActions,
  hasCapability,
} from "@convex/lib/roleProfiles";
import {
  CAPABILITY_KEYS,
  ORG_ACTION_TO_CAPABILITY,
  PROJECT_ACTION_TO_CAPABILITY,
} from "@convex/lib/capabilities";

// ── Frozen fixtures: main's ORG_ACTIONS / PROJECT_ACTIONS, inverted per role ──

const EXPECTED_ORG_ACTIONS: Record<string, string[]> = {
  owner: [
    "org:update",
    "org:delete",
    "org:transfer_ownership",
    "org:update_settings",
    "org:manage_billing",
    "org:invite_member",
    "org:remove_member",
    "org:change_role",
    "org:revoke_session",
    "org:view_sessions",
    "org:create_project",
    "org:delete_project",
    "org:link_extension",
    "org:rollback_variable",
    "org:create_tag",
    "org:manage_tag",
  ],
  project_manager: [
    "org:invite_member",
    "org:remove_member",
    "org:revoke_session",
    "org:view_sessions",
    "org:create_project",
    "org:link_extension",
    "org:create_tag",
    "org:manage_tag",
  ],
  team_lead: [
    "org:invite_member",
    "org:link_extension",
    "org:create_tag",
    "org:manage_tag",
  ],
  developer: ["org:link_extension", "org:create_tag"],
};

const EXPECTED_PROJECT_ACTIONS: Record<string, string[]> = {
  // Owner bypasses assignment, but the action set it can exercise is "all".
  owner: [
    "project:read",
    "project:update",
    "project:create_variable",
    "project:update_variable",
    "project:delete_variable",
    "project:manage_permissions",
    "project:review_requests",
    "project:manage_members",
    "project:create_account",
    "project:update_account",
    "project:delete_account",
    "project:manage_account_permissions",
  ],
  project_manager: [
    "project:read",
    "project:update",
    "project:create_variable",
    "project:update_variable",
    "project:delete_variable",
    "project:manage_permissions",
    "project:review_requests",
    "project:manage_members",
    "project:create_account",
    "project:update_account",
    "project:delete_account",
    "project:manage_account_permissions",
  ],
  team_lead: [
    "project:read",
    "project:create_variable",
    "project:update_variable",
    "project:delete_variable",
    "project:manage_permissions",
    "project:review_requests",
    "project:manage_members",
    "project:create_account",
    "project:update_account",
    "project:delete_account",
    "project:manage_account_permissions",
  ],
  // Main parity: developers CAN create variables/accounts directly (with an
  // auto write-grant on creation) but hold no blanket update/delete.
  developer: [
    "project:read",
    "project:create_variable",
    "project:create_account",
  ],
};

// NOTE: "project:review_requests" is NEW in the registry (main keyed request
// review off project:update_variable). Parity holds because on main the
// reviewer set == the project:update_variable set (owner/PM/TL), and the
// capability grants review to exactly those profiles.

describe("golden parity — system profiles reproduce main's authorization matrix", () => {
  for (const slug of ["owner", "project_manager", "team_lead", "developer"]) {
    it(`${slug}: org action set matches main`, () => {
      const { orgActions } = expandActions(SYSTEM_PROFILES[slug]);
      expect([...orgActions].sort()).toEqual(
        [...EXPECTED_ORG_ACTIONS[slug]].sort()
      );
    });

    it(`${slug}: project action set matches main`, () => {
      const { projectActions } = expandActions(SYSTEM_PROFILES[slug]);
      expect([...projectActions].sort()).toEqual(
        [...EXPECTED_PROJECT_ACTIONS[slug]].sort()
      );
    });
  }
});

describe("golden parity — access-model behavior flags", () => {
  it("developer is the only system role with grant fallback + env scoping", () => {
    expect(
      hasCapability(SYSTEM_PROFILES.developer, "access.grant_fallback")
    ).toBe(true);
    expect(hasCapability(SYSTEM_PROFILES.developer, "access.env_scoped")).toBe(
      true
    );
    for (const slug of ["owner", "project_manager", "team_lead"]) {
      expect(
        hasCapability(SYSTEM_PROFILES[slug], "access.grant_fallback")
      ).toBe(false);
      expect(hasCapability(SYSTEM_PROFILES[slug], "access.env_scoped")).toBe(
        false
      );
    }
  });

  it("blanket variable write (file writability / CLI push) is owner/PM/TL only", () => {
    for (const slug of ["owner", "project_manager", "team_lead"]) {
      expect(
        hasCapability(SYSTEM_PROFILES[slug], "project.variables.update")
      ).toBe(true);
    }
    expect(
      hasCapability(SYSTEM_PROFILES.developer, "project.variables.update")
    ).toBe(false);
  });

  it("request submission is developer-only among system roles (main parity)", () => {
    expect(
      hasCapability(SYSTEM_PROFILES.developer, "project.requests.submit")
    ).toBe(true);
    for (const slug of ["owner", "project_manager", "team_lead"]) {
      expect(
        hasCapability(SYSTEM_PROFILES[slug], "project.requests.submit")
      ).toBe(false);
    }
  });

  it("sharing is open to every system role (main parity — lockdown is a later profile edit)", () => {
    for (const slug of ["owner", "project_manager", "team_lead", "developer"]) {
      expect(hasCapability(SYSTEM_PROFILES[slug], "project.share")).toBe(true);
    }
  });

  it("notification floor: owner/PM/TL receive, developer skipped (emails.ts:537 parity)", () => {
    for (const slug of ["owner", "project_manager", "team_lead"]) {
      expect(
        hasCapability(SYSTEM_PROFILES[slug], "notify.variable_changes")
      ).toBe(true);
    }
    expect(
      hasCapability(SYSTEM_PROFILES.developer, "notify.variable_changes")
    ).toBe(false);
  });
});

describe("hierarchy levels", () => {
  it("orders owner > PM > TL > editor > developer > viewer with gaps", () => {
    const levels = [
      SYSTEM_PROFILES.owner.level,
      SYSTEM_PROFILES.project_manager.level,
      SYSTEM_PROFILES.team_lead.level,
      SEEDED_CUSTOM_PROFILES.editor.level,
      SYSTEM_PROFILES.developer.level,
      SEEDED_CUSTOM_PROFILES.viewer.level,
    ];
    expect(levels).toEqual([100, 80, 60, 50, 40, 20]);
    expect([...new Set(levels)]).toHaveLength(6);
  });
});

describe("seeded custom roles (editor / viewer)", () => {
  it("editor: writes variables + accounts, zero people-powers, env-scopeable", () => {
    const editor = SEEDED_CUSTOM_PROFILES.editor;
    expect(hasCapability(editor, "project.variables.update")).toBe(true);
    expect(hasCapability(editor, "project.variables.delete")).toBe(true);
    expect(hasCapability(editor, "project.accounts.update")).toBe(true);
    expect(hasCapability(editor, "project.requests.review")).toBe(false);
    expect(hasCapability(editor, "project.permissions.manage")).toBe(false);
    expect(hasCapability(editor, "project.members.manage")).toBe(false);
    expect(hasCapability(editor, "project.share")).toBe(false);
    expect(hasCapability(editor, "project.update")).toBe(false);
    expect(hasCapability(editor, "access.env_scoped")).toBe(true);
  });

  it("viewer: blanket read, env-scopeable, nothing else", () => {
    const viewer = SEEDED_CUSTOM_PROFILES.viewer;
    expect(hasCapability(viewer, "access.blanket_read")).toBe(true);
    expect(hasCapability(viewer, "access.env_scoped")).toBe(true);
    expect(hasCapability(viewer, "project.read")).toBe(true);
    const granted = Object.entries(viewer.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    expect(granted).toEqual([
      "access.blanket_read",
      "access.env_scoped",
      "org.clients.link",
      "project.read",
    ]);
  });
});

describe("catalog integrity", () => {
  it("every action maps to a declared capability", () => {
    for (const cap of Object.values(ORG_ACTION_TO_CAPABILITY)) {
      expect(CAPABILITY_KEYS).toContain(cap);
    }
    for (const cap of Object.values(PROJECT_ACTION_TO_CAPABILITY)) {
      expect(CAPABILITY_KEYS).toContain(cap);
    }
  });

  it("profiles never grant undeclared capabilities", () => {
    for (const profile of [
      ...Object.values(SYSTEM_PROFILES),
      ...Object.values(SEEDED_CUSTOM_PROFILES),
    ]) {
      for (const key of Object.keys(profile.capabilities)) {
        expect(CAPABILITY_KEYS).toContain(key);
      }
    }
  });

  it("unknown role fails closed: zero capabilities, level 0", () => {
    expect(UNKNOWN_ROLE_PROFILE.level).toBe(0);
    expect(Object.keys(UNKNOWN_ROLE_PROFILE.capabilities)).toHaveLength(0);
    const { orgActions, projectActions } = expandActions(UNKNOWN_ROLE_PROFILE);
    expect(orgActions).toHaveLength(0);
    expect(projectActions).toHaveLength(0);
  });
});
