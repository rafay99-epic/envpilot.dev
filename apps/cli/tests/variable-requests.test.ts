import { describe, it, expect } from "vitest";
import {
  ALL_REQUEST_ENVIRONMENTS,
  allowedRequestEnvironments,
  buildCreateVariableRequestBody,
  buildEligibleRequestTargets,
  buildProjectChoices,
  canSubmitRequests,
  formatProjectChoiceLabel,
  formatRequestContextBanner,
  formatRequestRow,
  formatRequestRows,
  formatRequestsListHeader,
  formatRequestSuccessMessage,
  formatRequestSummary,
  isRequestEligibleProject,
  validateRequestDescription,
  validateRequestKey,
  validateRequestValue,
  type RequestProjectCandidate,
  type RequestTarget,
} from "../src/lib/variable-requests.js";

describe("validateRequestKey", () => {
  it("accepts an uppercase key starting with a letter", () => {
    expect(validateRequestKey("API_SECRET")).toEqual({ valid: true });
    expect(validateRequestKey("A1")).toEqual({ valid: true });
  });

  it("rejects lowercase keys", () => {
    const result = validateRequestKey("api_secret");
    expect(result.valid).toBe(false);
  });

  it("rejects keys starting with a digit or underscore", () => {
    expect(validateRequestKey("1KEY").valid).toBe(false);
    expect(validateRequestKey("_KEY").valid).toBe(false);
  });

  it("rejects empty keys", () => {
    expect(validateRequestKey("").valid).toBe(false);
  });

  it("rejects keys over 100 characters", () => {
    const longKey = "A" + "B".repeat(100);
    expect(validateRequestKey(longKey).valid).toBe(false);
  });

  it("rejects keys with invalid characters", () => {
    expect(validateRequestKey("API-SECRET").valid).toBe(false);
    expect(validateRequestKey("API SECRET").valid).toBe(false);
  });
});

describe("validateRequestValue", () => {
  it("accepts any non-empty string", () => {
    expect(validateRequestValue("x").valid).toBe(true);
  });

  it("rejects an empty value", () => {
    expect(validateRequestValue("").valid).toBe(false);
  });
});

describe("validateRequestDescription", () => {
  it("accepts an empty description (optional field)", () => {
    expect(validateRequestDescription("").valid).toBe(true);
  });

  it("accepts a description under 500 characters", () => {
    expect(validateRequestDescription("A short description").valid).toBe(true);
  });

  it("rejects a description over 500 characters", () => {
    const long = "a".repeat(501);
    expect(validateRequestDescription(long).valid).toBe(false);
  });
});

describe("allowedRequestEnvironments", () => {
  it("returns all environments when scope is null", () => {
    expect(allowedRequestEnvironments(null)).toEqual([
      ...ALL_REQUEST_ENVIRONMENTS,
    ]);
  });

  it("returns all environments when scope is undefined", () => {
    expect(allowedRequestEnvironments(undefined)).toEqual([
      ...ALL_REQUEST_ENVIRONMENTS,
    ]);
  });

  it("returns NO environments for an explicit empty scope (matches the server's subset check)", () => {
    expect(allowedRequestEnvironments([])).toEqual([]);
  });

  it("filters to only the scoped environments, preserving canonical order", () => {
    expect(allowedRequestEnvironments(["production", "development"])).toEqual([
      "development",
      "production",
    ]);
  });

  it("ignores unknown scope values", () => {
    expect(allowedRequestEnvironments(["staging", "bogus"])).toEqual([
      "staging",
    ]);
  });

  it("returns an empty array when scope matches nothing known", () => {
    expect(allowedRequestEnvironments(["bogus"])).toEqual([]);
  });
});

describe("buildCreateVariableRequestBody", () => {
  it("trims key and description, defaults isSensitive to false", () => {
    const body = buildCreateVariableRequestBody({
      projectId: "proj_1",
      key: "  API_SECRET  ",
      value: "shh",
      description: "  a description  ",
      environments: ["development"],
    });

    expect(body).toEqual({
      projectId: "proj_1",
      key: "API_SECRET",
      value: "shh",
      description: "a description",
      environments: ["development"],
      isSensitive: false,
    });
  });

  it("omits description entirely when blank", () => {
    const body = buildCreateVariableRequestBody({
      projectId: "proj_1",
      key: "KEY",
      value: "v",
      description: "   ",
      environments: ["development"],
    });

    expect(body.description).toBeUndefined();
  });

  it("passes through an explicit isSensitive flag", () => {
    const body = buildCreateVariableRequestBody({
      projectId: "proj_1",
      key: "KEY",
      value: "v",
      environments: ["development", "production"],
      isSensitive: true,
    });

    expect(body.isSensitive).toBe(true);
    expect(body.environments).toEqual(["development", "production"]);
  });
});

describe("canSubmitRequests", () => {
  it("is capability-driven when a capability map is present", () => {
    expect(
      canSubmitRequests({
        capabilities: { "project.requests.submit": true },
        role: "owner", // role slug is ignored when capabilities are present
      })
    ).toBe(true);
    expect(
      canSubmitRequests({
        capabilities: { "project.requests.submit": false },
        role: "developer",
      })
    ).toBe(false);
    // A map without the key fails closed.
    expect(canSubmitRequests({ capabilities: {}, role: "developer" })).toBe(
      false
    );
  });

  it("falls back to the developer-role rule without capabilities", () => {
    expect(canSubmitRequests({ role: "developer" })).toBe(true);
    expect(canSubmitRequests({ role: "member" })).toBe(true);
    expect(canSubmitRequests({ role: "owner" })).toBe(false);
    expect(canSubmitRequests({ capabilities: null, role: "developer" })).toBe(
      true
    );
  });
});

describe("isRequestEligibleProject", () => {
  it("accepts an assigned developer (unified role)", () => {
    expect(
      isRequestEligibleProject({ unifiedRole: "developer", assigned: true })
    ).toBe(true);
  });

  it("accepts an assigned developer via the legacy `member` role", () => {
    expect(isRequestEligibleProject({ role: "member", assigned: true })).toBe(
      true
    );
  });

  it("rejects a developer who is not assigned", () => {
    expect(
      isRequestEligibleProject({ unifiedRole: "developer", assigned: false })
    ).toBe(false);
    // Missing `assigned` is treated as not assigned.
    expect(isRequestEligibleProject({ unifiedRole: "developer" })).toBe(false);
  });

  it("rejects owners, project managers, and team leads even when assigned", () => {
    for (const role of ["owner", "project_manager", "team_lead"]) {
      expect(
        isRequestEligibleProject({ unifiedRole: role, assigned: true })
      ).toBe(false);
    }
    // Legacy `admin` normalizes to owner → not eligible.
    expect(isRequestEligibleProject({ role: "admin", assigned: true })).toBe(
      false
    );
  });

  it("uses capabilities over the role slug when present (custom roles)", () => {
    // A custom role that may submit requests is eligible…
    expect(
      isRequestEligibleProject({
        unifiedRole: "release_captain",
        assigned: true,
        capabilities: { "project.requests.submit": true },
      })
    ).toBe(true);
    // …and a developer whose registry role lost the capability is not.
    expect(
      isRequestEligibleProject({
        unifiedRole: "developer",
        assigned: true,
        capabilities: { "project.requests.submit": false },
      })
    ).toBe(false);
    // Assignment is still required even with the capability.
    expect(
      isRequestEligibleProject({
        unifiedRole: "release_captain",
        assigned: false,
        capabilities: { "project.requests.submit": true },
      })
    ).toBe(false);
  });
});

describe("buildEligibleRequestTargets", () => {
  const orgNames = { org_a: "Acme", org_b: "Beta" };

  const projects: RequestProjectCandidate[] = [
    {
      _id: "p1",
      name: "web",
      organizationId: "org_a",
      unifiedRole: "developer",
      assigned: true,
      environmentScope: ["development", "staging"],
    },
    {
      // Not assigned → filtered out.
      _id: "p2",
      name: "infra",
      organizationId: "org_a",
      unifiedRole: "developer",
      assigned: false,
      environmentScope: null,
    },
    {
      // Team lead → filtered out (creates variables directly).
      _id: "p3",
      name: "billing",
      organizationId: "org_b",
      unifiedRole: "team_lead",
      assigned: true,
      environmentScope: null,
    },
    {
      _id: "p4",
      name: "mobile",
      organizationId: "org_b",
      unifiedRole: "developer",
      assigned: true,
      environmentScope: null,
    },
  ];

  it("keeps only assigned developers and labels them with org names", () => {
    const targets = buildEligibleRequestTargets(projects, orgNames);
    expect(targets).toEqual([
      {
        projectId: "p1",
        projectName: "web",
        organizationId: "org_a",
        organizationName: "Acme",
        environmentScope: ["development", "staging"],
      },
      {
        projectId: "p4",
        projectName: "mobile",
        organizationId: "org_b",
        organizationName: "Beta",
        environmentScope: null,
      },
    ]);
  });

  it("falls back to the org id when the name is unknown", () => {
    const targets = buildEligibleRequestTargets([projects[0]], {});
    expect(targets[0].organizationName).toBe("org_a");
  });

  it("normalizes a missing environmentScope to null", () => {
    const targets = buildEligibleRequestTargets(
      [
        {
          _id: "p",
          name: "x",
          organizationId: "org_a",
          role: "member",
          assigned: true,
        },
      ],
      orgNames
    );
    expect(targets[0].environmentScope).toBeNull();
  });
});

describe("formatProjectChoiceLabel / buildProjectChoices", () => {
  const targets: RequestTarget[] = [
    {
      projectId: "p1",
      projectName: "web",
      organizationId: "org_a",
      organizationName: "Acme",
    },
    {
      projectId: "p4",
      projectName: "mobile",
      organizationId: "org_b",
      organizationName: "Beta",
    },
  ];

  it("labels a target as '<project> — <org>'", () => {
    expect(formatProjectChoiceLabel(targets[0])).toBe("web — Acme");
  });

  it("builds inquirer choices with projectId values", () => {
    expect(buildProjectChoices(targets)).toEqual([
      { name: "web — Acme", value: "p1" },
      { name: "mobile — Beta", value: "p4" },
    ]);
  });
});

describe("formatRequestContextBanner", () => {
  it("shows the account email and the project/org target", () => {
    expect(
      formatRequestContextBanner({
        email: "dev@example.com",
        projectName: "web",
        organizationName: "Acme",
      })
    ).toBe(
      "Requesting as dev@example.com\nProject: web  ·  Organization: Acme"
    );
  });
});

describe("formatRequestSummary", () => {
  it("aligns labels and renders the target, environments, and sensitivity", () => {
    const summary = formatRequestSummary({
      key: "API_KEY",
      projectName: "web",
      organizationName: "Acme",
      environments: ["development", "staging"],
      isSensitive: false,
    });
    expect(summary).toBe(
      [
        "Key:           API_KEY",
        "Project:       web — Acme",
        "Environments:  development, staging",
        "Sensitive:     no",
      ].join("\n")
    );
  });

  it("renders sensitive values as 'yes'", () => {
    const summary = formatRequestSummary({
      key: "API_KEY",
      projectName: "web",
      organizationName: "Acme",
      environments: ["production"],
      isSensitive: true,
    });
    expect(summary).toContain("Sensitive:     yes");
  });
});

describe("formatRequestSuccessMessage / formatRequestsListHeader", () => {
  it("names the key, project, and org in the success line", () => {
    expect(
      formatRequestSuccessMessage({
        key: "API_KEY",
        projectName: "web",
        organizationName: "Acme",
      })
    ).toBe('Request "API_KEY" submitted for web (Acme) — pending review.');
  });

  it("names the project the requests listing is for", () => {
    expect(
      formatRequestsListHeader({ projectName: "web", organizationName: "Acme" })
    ).toBe("Requests for web — Acme");
  });
});

describe("scope filtering for a switched (picked) project", () => {
  it("uses the picked project's scope, not the linked one", () => {
    const targets = buildEligibleRequestTargets(
      [
        {
          _id: "p1",
          name: "web",
          organizationId: "org_a",
          unifiedRole: "developer",
          assigned: true,
          environmentScope: ["development"],
        },
      ],
      { org_a: "Acme" }
    );
    // The env choices offered must derive from the picked target's scope.
    expect(allowedRequestEnvironments(targets[0].environmentScope)).toEqual([
      "development",
    ]);
  });

  it("yields no environments (command exits) when the picked project's scope matches none", () => {
    const targets = buildEligibleRequestTargets(
      [
        {
          _id: "p1",
          name: "web",
          organizationId: "org_a",
          unifiedRole: "developer",
          assigned: true,
          // A scope that intersects none of the three canonical request
          // environments → the command reports "no environments" and exits.
          environmentScope: ["preview"],
        },
      ],
      { org_a: "Acme" }
    );
    expect(allowedRequestEnvironments(targets[0].environmentScope)).toEqual([]);
  });
});

describe("formatRequestRow / formatRequestRows", () => {
  const base = {
    key: "API_SECRET",
    environments: ["development", "staging"],
    status: "pending" as const,
    createdAt: new Date("2026-01-15T00:00:00Z").getTime(),
  };

  it("joins environments with a comma", () => {
    const row = formatRequestRow(base);
    expect(row.environments).toBe("development, staging");
  });

  it("defaults the reason to an empty string when absent", () => {
    const row = formatRequestRow(base);
    expect(row.reason).toBe("");
  });

  it("surfaces the review reason when present", () => {
    const row = formatRequestRow({ ...base, reviewReason: "Not needed" });
    expect(row.reason).toBe("Not needed");
  });

  it("formats multiple rows", () => {
    const rows = formatRequestRows([
      base,
      { ...base, key: "OTHER_KEY", status: "approved" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].key).toBe("OTHER_KEY");
    expect(rows[1].status).toBe("approved");
  });
});
