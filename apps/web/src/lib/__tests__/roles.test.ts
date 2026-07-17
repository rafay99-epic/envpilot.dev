import { describe, expect, it } from "vitest";

import {
  ENV_SCOPED_ROLE_FALLBACK,
  ORG_ROLE_LABELS,
  ROLE_FALLBACK_COLOR,
  ROLE_LEVEL,
  normalizeOrgRole,
  roleBadgeColor,
  roleLabel,
  roleLevel,
  toLegacyOrgRole,
  toLegacyProjectRole,
} from "@/lib/roles";

describe("normalizeOrgRole", () => {
  it("maps legacy admin to owner", () => {
    expect(normalizeOrgRole("admin")).toBe("owner");
  });

  it("maps legacy member to developer", () => {
    expect(normalizeOrgRole("member")).toBe("developer");
  });

  it("passes seeded roles through unchanged", () => {
    for (const slug of Object.keys(ROLE_LEVEL)) {
      expect(normalizeOrgRole(slug)).toBe(slug);
    }
  });

  it("passes unknown/custom slugs through (registry decides)", () => {
    expect(normalizeOrgRole("superuser")).toBe("superuser");
    expect(normalizeOrgRole("OWNER")).toBe("OWNER");
  });

  it("falls back to developer only for empty values", () => {
    expect(normalizeOrgRole("")).toBe("developer");
    expect(normalizeOrgRole(null)).toBe("developer");
    expect(normalizeOrgRole(undefined)).toBe("developer");
  });
});

describe("ROLE_LEVEL / roleLevel", () => {
  it("assigns the registry levels to the seeded slugs", () => {
    expect(ROLE_LEVEL).toEqual({
      owner: 100,
      project_manager: 80,
      team_lead: 60,
      editor: 50,
      developer: 40,
      viewer: 20,
    });
  });

  it("roleLevel normalizes legacy roles before lookup", () => {
    expect(roleLevel("admin")).toBe(ROLE_LEVEL.owner);
    expect(roleLevel("member")).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(null)).toBe(ROLE_LEVEL.developer);
    expect(roleLevel(undefined)).toBe(ROLE_LEVEL.developer);
  });

  it("unknown/custom slugs resolve to 0 (fail closed)", () => {
    expect(roleLevel("nonsense")).toBe(0);
    expect(roleLevel("release_captain")).toBe(0);
  });
});

describe("roleLabel", () => {
  it("uses the seeded fallback label for known slugs", () => {
    for (const [slug, label] of Object.entries(ORG_ROLE_LABELS)) {
      expect(roleLabel(slug)).toBe(label);
    }
  });

  it("humanizes unknown slugs instead of crashing", () => {
    expect(roleLabel("release_captain")).toBe("Release Captain");
    expect(roleLabel("qa-bot")).toBe("Qa Bot");
  });

  it("normalizes legacy values first", () => {
    expect(roleLabel("admin")).toBe("Owner");
    expect(roleLabel(null)).toBe("Developer");
  });
});

describe("roleBadgeColor", () => {
  it("maps every seeded fallback color to a distinct badge class", () => {
    const classes = new Set(
      Object.values(ROLE_FALLBACK_COLOR).map(roleBadgeColor)
    );
    expect(classes.size).toBe(new Set(Object.values(ROLE_FALLBACK_COLOR)).size);
  });

  it("renders unknown tokens as zinc (never crashes)", () => {
    expect(roleBadgeColor("chartreuse")).toBe(roleBadgeColor("zinc"));
  });
});

describe("ENV_SCOPED_ROLE_FALLBACK", () => {
  it("covers the seeded env-scopeable roles only", () => {
    expect([...ENV_SCOPED_ROLE_FALLBACK].sort()).toEqual([
      "developer",
      "editor",
      "viewer",
    ]);
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
    // Custom/unknown slugs map to the least-privileged legacy role.
    ["editor", "member"],
    ["viewer", "member"],
    ["nonsense", "member"],
  ];

  it.each(cases)("maps %s to %s", (unified, legacy) => {
    expect(toLegacyOrgRole(unified)).toBe(legacy);
  });

  it("maps null and undefined to member (developer fallback)", () => {
    expect(toLegacyOrgRole(null)).toBe("member");
    expect(toLegacyOrgRole(undefined)).toBe("member");
  });
});

describe("toLegacyProjectRole", () => {
  it("returns null for unassigned users regardless of role", () => {
    expect(toLegacyProjectRole("owner", false)).toBeNull();
    expect(toLegacyProjectRole("developer", false)).toBeNull();
    expect(toLegacyProjectRole(null, false)).toBeNull();
  });

  it("maps assigned writable roles to manager", () => {
    for (const role of ["owner", "project_manager", "team_lead"]) {
      expect(toLegacyProjectRole(role, true)).toBe("manager");
    }
  });

  it("maps every other assigned role to developer", () => {
    expect(toLegacyProjectRole("developer", true)).toBe("developer");
    expect(toLegacyProjectRole("editor", true)).toBe("developer");
    expect(toLegacyProjectRole("viewer", true)).toBe("developer");
    expect(toLegacyProjectRole("admin", true)).toBe("manager");
    expect(toLegacyProjectRole("member", true)).toBe("developer");
    expect(toLegacyProjectRole("nonsense", true)).toBe("developer");
    expect(toLegacyProjectRole(null, true)).toBe("developer");
  });
});
