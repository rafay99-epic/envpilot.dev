import { describe, it, expect } from "vitest";
import {
  normalizeOrgRole,
  roleLevel,
  formatRoleLabel,
  isFileWritable,
  fileProtectionMode,
  ROLE_LEVEL,
  type OrgRole,
  type ProjectAccess,
} from "./roles";

describe("normalizeOrgRole", () => {
  it("maps legacy admin → owner", () => {
    expect(normalizeOrgRole("admin")).toBe("owner");
  });

  it("maps legacy member → developer", () => {
    expect(normalizeOrgRole("member")).toBe("developer");
  });

  it("passes seeded registry roles through unchanged", () => {
    expect(normalizeOrgRole("owner")).toBe("owner");
    expect(normalizeOrgRole("project_manager")).toBe("project_manager");
    expect(normalizeOrgRole("team_lead")).toBe("team_lead");
    expect(normalizeOrgRole("editor")).toBe("editor");
    expect(normalizeOrgRole("developer")).toBe("developer");
    expect(normalizeOrgRole("viewer")).toBe("viewer");
  });

  it("passes unknown/custom slugs through (open registry)", () => {
    expect(normalizeOrgRole("wizard")).toBe("wizard");
    expect(normalizeOrgRole("release_captain")).toBe("release_captain");
  });

  it("defaults only empty / null / undefined to developer", () => {
    expect(normalizeOrgRole("")).toBe("developer");
    expect(normalizeOrgRole(null)).toBe("developer");
    expect(normalizeOrgRole(undefined)).toBe("developer");
  });
});

describe("roleLevel", () => {
  it("uses the seeded registry levels", () => {
    expect(roleLevel("owner")).toBe(100);
    expect(roleLevel("project_manager")).toBe(80);
    expect(roleLevel("team_lead")).toBe(60);
    expect(roleLevel("editor")).toBe(50);
    expect(roleLevel("developer")).toBe(40);
    expect(roleLevel("viewer")).toBe(20);
  });

  it("is strictly descending across the hierarchy", () => {
    expect(roleLevel("owner")).toBeGreaterThan(roleLevel("project_manager"));
    expect(roleLevel("project_manager")).toBeGreaterThan(
      roleLevel("team_lead")
    );
    expect(roleLevel("team_lead")).toBeGreaterThan(roleLevel("editor"));
    expect(roleLevel("editor")).toBeGreaterThan(roleLevel("developer"));
    expect(roleLevel("developer")).toBeGreaterThan(roleLevel("viewer"));
  });

  it("normalizes legacy roles before ranking", () => {
    expect(roleLevel("admin")).toBe(ROLE_LEVEL.owner);
    expect(roleLevel("member")).toBe(ROLE_LEVEL.developer);
  });

  it("ranks unknown/custom slugs at 0 (fail-closed)", () => {
    expect(roleLevel("nonsense")).toBe(0);
    expect(roleLevel("release_captain")).toBe(0);
  });

  it("ranks a missing role at the developer level", () => {
    expect(roleLevel(null)).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(undefined)).toBe(ROLE_LEVEL.developer);
  });
});

describe("formatRoleLabel", () => {
  it("returns human-readable labels for seeded roles", () => {
    expect(formatRoleLabel("owner")).toBe("Owner");
    expect(formatRoleLabel("project_manager")).toBe("Project Manager");
    expect(formatRoleLabel("team_lead")).toBe("Team Lead");
    expect(formatRoleLabel("editor")).toBe("Editor");
    expect(formatRoleLabel("developer")).toBe("Developer");
    expect(formatRoleLabel("viewer")).toBe("Viewer");
  });

  it("normalizes legacy org roles to unified labels", () => {
    expect(formatRoleLabel("admin")).toBe("Owner");
    expect(formatRoleLabel("member")).toBe("Developer");
  });

  it("humanizes unknown/custom slugs (snake_case → Title Case)", () => {
    expect(formatRoleLabel("release_captain")).toBe("Release Captain");
    expect(formatRoleLabel("ghost")).toBe("Ghost");
  });

  it("prefers a server-provided display name", () => {
    expect(
      formatRoleLabel("release_captain", { displayName: "Ship Captain" })
    ).toBe("Ship Captain");
    expect(formatRoleLabel("release_captain", {})).toBe("Release Captain");
  });

  it("falls back to Developer for a missing role", () => {
    expect(formatRoleLabel(null)).toBe("Developer");
    expect(formatRoleLabel(undefined)).toBe("Developer");
  });
});

describe("isFileWritable", () => {
  const access = (partial: Partial<ProjectAccess>): ProjectAccess => ({
    role: "developer",
    assigned: true,
    hasWriteAccess: false,
    ...partial,
  });

  it("owner is always writable, even when unassigned (implicit access)", () => {
    expect(isFileWritable(access({ role: "owner", assigned: false }))).toBe(
      true
    );
    expect(isFileWritable(access({ role: "owner", assigned: true }))).toBe(
      true
    );
  });

  it("unassigned non-owners always get a read-only file", () => {
    for (const role of [
      "project_manager",
      "team_lead",
      "developer",
      "custom_role",
    ] as OrgRole[]) {
      expect(
        isFileWritable(access({ role, assigned: false, hasWriteAccess: true }))
      ).toBe(false);
    }
  });

  it("assigned project_manager / team_lead are always writable", () => {
    for (const role of ["project_manager", "team_lead"] as OrgRole[]) {
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: false }))
      ).toBe(true);
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: true }))
      ).toBe(true);
    }
  });

  it("assigned developer is writable only with an explicit write grant", () => {
    expect(
      isFileWritable(
        access({ role: "developer", assigned: true, hasWriteAccess: true })
      )
    ).toBe(true);
    expect(
      isFileWritable(
        access({ role: "developer", assigned: true, hasWriteAccess: false })
      )
    ).toBe(false);
  });

  it("assigned editor/viewer/custom roles defer to server hasWriteAccess", () => {
    for (const role of ["editor", "viewer", "release_captain"] as OrgRole[]) {
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: true }))
      ).toBe(true);
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: false }))
      ).toBe(false);
    }
  });
});

describe("fileProtectionMode (legacy, no capabilities)", () => {
  it("owner → writable, regardless of assignment", () => {
    expect(
      fileProtectionMode({
        role: "owner",
        assigned: false,
        hasWriteAccess: false,
      })
    ).toBe("writable");
    expect(
      fileProtectionMode({
        role: "owner",
        assigned: true,
        hasWriteAccess: false,
      })
    ).toBe("writable");
  });

  it("assigned project_manager / team_lead → writable", () => {
    expect(
      fileProtectionMode({
        role: "project_manager",
        assigned: true,
        hasWriteAccess: false,
      })
    ).toBe("writable");
    expect(
      fileProtectionMode({
        role: "team_lead",
        assigned: true,
        hasWriteAccess: false,
      })
    ).toBe("writable");
  });

  it("assigned developer with a write grant → writable", () => {
    expect(
      fileProtectionMode({
        role: "developer",
        assigned: true,
        hasWriteAccess: true,
      })
    ).toBe("writable");
  });

  it("assigned developer without a write grant → readonly-with-request", () => {
    expect(
      fileProtectionMode({
        role: "developer",
        assigned: true,
        hasWriteAccess: false,
      })
    ).toBe("readonly-with-request");
  });

  it("unassigned (grant-only / not a project member) → strict-readonly", () => {
    for (const role of [
      "project_manager",
      "team_lead",
      "developer",
    ] as OrgRole[]) {
      expect(
        fileProtectionMode({ role, assigned: false, hasWriteAccess: true })
      ).toBe("strict-readonly");
    }
  });
});

describe("fileProtectionMode (capability-driven)", () => {
  const access = (partial: Partial<ProjectAccess>): ProjectAccess => ({
    role: "release_captain",
    assigned: true,
    hasWriteAccess: false,
    ...partial,
  });

  it("hasWriteAccess → writable, whatever the role slug", () => {
    expect(
      fileProtectionMode(access({ hasWriteAccess: true }), {
        "project.requests.submit": false,
      })
    ).toBe("writable");
  });

  it("read-only with the submit capability → readonly-with-request", () => {
    expect(
      fileProtectionMode(access({}), { "project.requests.submit": true })
    ).toBe("readonly-with-request");
  });

  it("read-only without the submit capability → strict-readonly", () => {
    expect(
      fileProtectionMode(access({}), { "project.requests.submit": false })
    ).toBe("strict-readonly");
    expect(fileProtectionMode(access({}), {})).toBe("strict-readonly");
  });

  it("null/undefined capabilities fall back to the legacy role rules", () => {
    const dev = access({ role: "developer" });
    expect(fileProtectionMode(dev, null)).toBe("readonly-with-request");
    expect(fileProtectionMode(dev, undefined)).toBe("readonly-with-request");
  });
});
