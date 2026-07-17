import { describe, it, expect } from "vitest";
import {
  groupProjectsForPicker,
  isRequestEligible,
  type PickerProjectRow,
} from "./requestTarget";
import type { Organization, Project } from "../types";

function project(partial: Partial<Project> & { _id: string }): Project {
  return {
    name: partial._id,
    slug: partial._id,
    description: null,
    organizationId: "org1",
    icon: null,
    color: null,
    unifiedRole: "developer",
    assigned: true,
    ...partial,
  };
}

function org(id: string, name: string): Organization {
  return { _id: id, name, slug: id, tier: "free" };
}

const orgs = [org("org1", "Acme"), org("org2", "Globex")];

/** Only the project rows, in order — separators dropped for concise asserts. */
function projectRows(
  projects: Project[],
  organizations: Organization[] = orgs,
  currentId?: string | null
): PickerProjectRow[] {
  return groupProjectsForPicker(projects, organizations, currentId).filter(
    (r): r is PickerProjectRow => r.kind === "project"
  );
}

describe("isRequestEligible", () => {
  it("accepts an assigned developer", () => {
    expect(isRequestEligible(project({ _id: "p" }))).toBe(true);
  });

  it("accepts a legacy 'member' role via normalization", () => {
    expect(
      isRequestEligible(
        project({ _id: "p", unifiedRole: undefined, userRole: "member" })
      )
    ).toBe(true);
  });

  it("rejects every non-developer role (only developers request)", () => {
    for (const role of [
      "owner",
      "project_manager",
      "team_lead",
      "editor",
      "viewer",
    ]) {
      expect(isRequestEligible(project({ _id: "p", unifiedRole: role }))).toBe(
        false
      );
    }
  });

  it("rejects a developer who is explicitly not assigned (grant-only)", () => {
    expect(isRequestEligible(project({ _id: "p", assigned: false }))).toBe(
      false
    );
  });

  it("treats a missing assigned flag as eligible (legacy server)", () => {
    expect(isRequestEligible(project({ _id: "p", assigned: undefined }))).toBe(
      true
    );
  });
});

describe("groupProjectsForPicker", () => {
  it("filters out ineligible projects", () => {
    const rows = projectRows([
      project({ _id: "dev" }),
      project({ _id: "owner", unifiedRole: "owner" }),
      project({ _id: "grantOnly", assigned: false }),
    ]);
    expect(rows.map((r) => r.project._id)).toEqual(["dev"]);
  });

  it("returns no rows when nothing is eligible", () => {
    const rows = groupProjectsForPicker(
      [project({ _id: "owner", unifiedRole: "owner" })],
      orgs
    );
    expect(rows).toEqual([]);
  });

  it("groups projects by organization with a named separator per group", () => {
    const rows = groupProjectsForPicker(
      [
        project({ _id: "a", organizationId: "org1" }),
        project({ _id: "b", organizationId: "org2" }),
      ],
      orgs
    );
    expect(rows).toEqual([
      { kind: "separator", label: "Acme" },
      expect.objectContaining({ kind: "project", label: "a" }),
      { kind: "separator", label: "Globex" },
      expect.objectContaining({ kind: "project", label: "b" }),
    ]);
  });

  it("falls back to the org id when its name is unknown", () => {
    const rows = groupProjectsForPicker(
      [project({ _id: "a", organizationId: "orgX" })],
      orgs
    );
    expect(rows[0]).toEqual({ kind: "separator", label: "orgX" });
  });

  it("orders the current project first within its group and marks it", () => {
    const rows = projectRows(
      [
        project({ _id: "a", organizationId: "org1" }),
        project({ _id: "current", organizationId: "org1" }),
        project({ _id: "c", organizationId: "org1" }),
      ],
      orgs,
      "current"
    );
    expect(rows.map((r) => r.project._id)).toEqual(["current", "a", "c"]);
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].label).toBe("$(check) current");
    expect(rows[1].isCurrent).toBe(false);
  });

  it("describes role and, for scoped developers, the environment scope", () => {
    const [scoped, unscoped] = projectRows([
      project({
        _id: "scoped",
        environmentScope: ["development", "staging"],
      }),
      project({ _id: "unscoped", environmentScope: null }),
    ]);
    expect(scoped.description).toBe("Developer · scope: development, staging");
    expect(unscoped.description).toBe("Developer");
  });
});
