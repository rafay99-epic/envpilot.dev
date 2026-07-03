import { describe, it, expect } from "vitest";
import {
  ALL_REQUEST_ENVIRONMENTS,
  allowedRequestEnvironments,
  buildCreateVariableRequestBody,
  formatRequestRow,
  formatRequestRows,
  validateRequestDescription,
  validateRequestKey,
  validateRequestValue,
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

  it("returns all environments when scope is an empty array", () => {
    expect(allowedRequestEnvironments([])).toEqual([
      ...ALL_REQUEST_ENVIRONMENTS,
    ]);
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
