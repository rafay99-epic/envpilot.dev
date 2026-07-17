import { describe, it, expect } from "vitest";
import {
  normalizeOrgRole,
  roleLevel,
  formatRoleLabel,
  isFileWritable,
  ROLE_LEVEL,
  type OrgRole,
  type ProjectAccess,
} from "../src/lib/roles.js";

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

  it("normalizes legacy roles to unified labels", () => {
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

  it("owner is always writable, even when unassigned (implicit access)", () => {
    // The legacy server sends no assignment info for owners; they must still
    // get a writable file.
    expect(isFileWritable(access({ role: "owner", assigned: false }))).toBe(
      true
    );
    expect(isFileWritable(access({ role: "owner", assigned: true }))).toBe(
      true
    );
  });

  it("assigned owner / project_manager / team_lead are always writable", () => {
    for (const role of ["owner", "project_manager", "team_lead"] as OrgRole[]) {
      // writable regardless of hasWriteAccess
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: false }))
      ).toBe(true);
      expect(
        isFileWritable(access({ role, assigned: true, hasWriteAccess: true }))
      ).toBe(true);
    }
  });

  it("assigned developer is writable only with a write grant", () => {
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
