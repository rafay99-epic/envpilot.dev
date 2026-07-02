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

  it("passes unified roles through unchanged", () => {
    expect(normalizeOrgRole("owner")).toBe("owner");
    expect(normalizeOrgRole("project_manager")).toBe("project_manager");
    expect(normalizeOrgRole("team_lead")).toBe("team_lead");
    expect(normalizeOrgRole("developer")).toBe("developer");
  });

  it("defaults unknown / null / undefined to developer", () => {
    expect(normalizeOrgRole("wizard")).toBe("developer");
    expect(normalizeOrgRole("")).toBe("developer");
    expect(normalizeOrgRole(null)).toBe("developer");
    expect(normalizeOrgRole(undefined)).toBe("developer");
    // legacy project role that is not an org role also falls through
    expect(normalizeOrgRole("manager")).toBe("developer");
    expect(normalizeOrgRole("viewer")).toBe("developer");
  });
});

describe("roleLevel", () => {
  it("orders owner > project_manager > team_lead > developer", () => {
    expect(roleLevel("owner")).toBe(4);
    expect(roleLevel("project_manager")).toBe(3);
    expect(roleLevel("team_lead")).toBe(2);
    expect(roleLevel("developer")).toBe(1);
  });

  it("is strictly descending across the hierarchy", () => {
    expect(roleLevel("owner")).toBeGreaterThan(roleLevel("project_manager"));
    expect(roleLevel("project_manager")).toBeGreaterThan(roleLevel("team_lead"));
    expect(roleLevel("team_lead")).toBeGreaterThan(roleLevel("developer"));
  });

  it("normalizes legacy roles before ranking", () => {
    expect(roleLevel("admin")).toBe(ROLE_LEVEL.owner);
    expect(roleLevel("member")).toBe(ROLE_LEVEL.developer);
  });

  it("defaults unknown roles to the developer level", () => {
    expect(roleLevel("nonsense")).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(null)).toBe(ROLE_LEVEL.developer);
  });
});

describe("formatRoleLabel", () => {
  it("returns human-readable labels for unified roles", () => {
    expect(formatRoleLabel("owner")).toBe("Owner");
    expect(formatRoleLabel("project_manager")).toBe("Project Manager");
    expect(formatRoleLabel("team_lead")).toBe("Team Lead");
    expect(formatRoleLabel("developer")).toBe("Developer");
  });

  it("normalizes legacy roles to unified labels", () => {
    expect(formatRoleLabel("admin")).toBe("Owner");
    expect(formatRoleLabel("member")).toBe("Developer");
  });

  it("falls back to Developer for unknown input", () => {
    expect(formatRoleLabel("ghost")).toBe("Developer");
    expect(formatRoleLabel(null)).toBe("Developer");
  });
});

describe("isFileWritable", () => {
  const access = (partial: Partial<ProjectAccess>): ProjectAccess => ({
    role: "developer",
    assigned: true,
    hasWriteAccess: false,
    ...partial,
  });

  it("unassigned users always get a read-only file", () => {
    for (const role of [
      "owner",
      "project_manager",
      "team_lead",
      "developer",
    ] as OrgRole[]) {
      expect(
        isFileWritable(access({ role, assigned: false, hasWriteAccess: true }))
      ).toBe(false);
    }
  });

  it("assigned owner / project_manager / team_lead are always writable", () => {
    for (const role of [
      "owner",
      "project_manager",
      "team_lead",
    ] as OrgRole[]) {
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
});
