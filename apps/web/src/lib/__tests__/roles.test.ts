import { describe, expect, it } from "vitest";

import {
  ORG_ROLES,
  ORG_ROLE_LABELS,
  ROLE_LEVEL,
  assignableRoles,
  normalizeOrgRole,
  roleLevel,
  toLegacyOrgRole,
  toLegacyProjectRole,
  type OrgRole,
} from "@/lib/roles";

describe("normalizeOrgRole", () => {
  it("maps legacy admin to owner", () => {
    expect(normalizeOrgRole("admin")).toBe("owner");
  });

  it("maps legacy member to developer", () => {
    expect(normalizeOrgRole("member")).toBe("developer");
  });

  it("passes unified roles through unchanged", () => {
    expect(normalizeOrgRole("owner")).toBe("owner");
    expect(normalizeOrgRole("project_manager")).toBe("project_manager");
    expect(normalizeOrgRole("team_lead")).toBe("team_lead");
    expect(normalizeOrgRole("developer")).toBe("developer");
  });

  it("falls back to developer for unknown values", () => {
    expect(normalizeOrgRole("superuser")).toBe("developer");
    expect(normalizeOrgRole("")).toBe("developer");
    expect(normalizeOrgRole("OWNER")).toBe("developer");
  });

  it("falls back to developer for null and undefined", () => {
    expect(normalizeOrgRole(null)).toBe("developer");
    expect(normalizeOrgRole(undefined)).toBe("developer");
  });
});

describe("ROLE_LEVEL / roleLevel", () => {
  it("orders roles owner > project_manager > team_lead > developer", () => {
    expect(ROLE_LEVEL.owner).toBeGreaterThan(ROLE_LEVEL.project_manager);
    expect(ROLE_LEVEL.project_manager).toBeGreaterThan(ROLE_LEVEL.team_lead);
    expect(ROLE_LEVEL.team_lead).toBeGreaterThan(ROLE_LEVEL.developer);
  });

  it("assigns the documented numeric levels", () => {
    expect(ROLE_LEVEL).toEqual({
      owner: 4,
      project_manager: 3,
      team_lead: 2,
      developer: 1,
    });
  });

  it("roleLevel normalizes legacy and unknown roles before lookup", () => {
    expect(roleLevel("admin")).toBe(ROLE_LEVEL.owner);
    expect(roleLevel("member")).toBe(ROLE_LEVEL.developer);
    expect(roleLevel("nonsense")).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(null)).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(undefined)).toBe(ROLE_LEVEL.developer);
  });

  it("ORG_ROLES lists every role exactly once, highest first", () => {
    expect(ORG_ROLES).toEqual([
      "owner",
      "project_manager",
      "team_lead",
      "developer",
    ]);
    expect(new Set(ORG_ROLES).size).toBe(ORG_ROLES.length);
  });

  it("every role has a display label", () => {
    for (const role of ORG_ROLES) {
      expect(ORG_ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe("assignableRoles", () => {
  it("owner can assign every role, including owner", () => {
    expect(assignableRoles("owner")).toEqual([
      "owner",
      "project_manager",
      "team_lead",
      "developer",
    ]);
  });

  it("project_manager can assign only roles strictly below them", () => {
    expect(assignableRoles("project_manager")).toEqual([
      "team_lead",
      "developer",
    ]);
  });

  it("team_lead can assign only developer", () => {
    expect(assignableRoles("team_lead")).toEqual(["developer"]);
  });

  it("developer can assign nothing", () => {
    expect(assignableRoles("developer")).toEqual([]);
  });

  it("legacy admin behaves as owner", () => {
    expect(assignableRoles("admin")).toEqual([
      "owner",
      "project_manager",
      "team_lead",
      "developer",
    ]);
  });

  it("legacy member, unknown, null and undefined behave as developer", () => {
    expect(assignableRoles("member")).toEqual([]);
    expect(assignableRoles("nonsense")).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
    expect(assignableRoles(undefined)).toEqual([]);
  });

  it("returns a fresh array for owners (no shared mutable state)", () => {
    const first = assignableRoles("owner");
    first.pop();
    expect(assignableRoles("owner")).toHaveLength(4);
    expect(ORG_ROLES).toHaveLength(4);
  });
});

describe("toLegacyOrgRole", () => {
  const cases: Array<[string, string]> = [
    ["owner", "admin"],
    ["project_manager", "team_lead"],
    ["team_lead", "team_lead"],
    ["developer", "member"],
    // Legacy inputs round-trip through normalization first.
    ["admin", "admin"],
    ["member", "member"],
  ];

  it.each(cases)("maps %s to %s", (unified, legacy) => {
    expect(toLegacyOrgRole(unified)).toBe(legacy);
  });

  it("maps unknown, null and undefined to member (developer fallback)", () => {
    expect(toLegacyOrgRole("nonsense")).toBe("member");
    expect(toLegacyOrgRole(null)).toBe("member");
    expect(toLegacyOrgRole(undefined)).toBe("member");
  });
});

describe("toLegacyProjectRole", () => {
  it("returns null for unassigned users regardless of role", () => {
    for (const role of ORG_ROLES) {
      expect(toLegacyProjectRole(role, false)).toBeNull();
    }
    expect(toLegacyProjectRole(null, false)).toBeNull();
  });

  it("maps assigned writable roles to manager", () => {
    const writable: OrgRole[] = ["owner", "project_manager", "team_lead"];
    for (const role of writable) {
      expect(toLegacyProjectRole(role, true)).toBe("manager");
    }
  });

  it("maps assigned developer to developer", () => {
    expect(toLegacyProjectRole("developer", true)).toBe("developer");
  });

  it("maps assigned legacy and unknown roles through normalization", () => {
    expect(toLegacyProjectRole("admin", true)).toBe("manager");
    expect(toLegacyProjectRole("member", true)).toBe("developer");
    expect(toLegacyProjectRole("nonsense", true)).toBe("developer");
    expect(toLegacyProjectRole(null, true)).toBe("developer");
    expect(toLegacyProjectRole(undefined, true)).toBe("developer");
  });
});
