import { describe, it, expect } from "vitest";
import {
  isProtectedEnvironmentError,
  formatProtectedEnvironments,
} from "../src/lib/errors.js";
import {
  protectedPushRefusalMessage,
  formatRequestedRows,
  isRequestFilingComplete,
} from "../src/commands/push.js";
import {
  requestedSuccessMessage,
  protectedDeletePrompt,
  PROTECTED_DELETE_HINT,
} from "../src/commands/secrets.js";
import { findMatchingChangeRequest } from "../src/commands/requests.js";
import type { ChangeRequestRow } from "../src/lib/api.js";

describe("isProtectedEnvironmentError", () => {
  it("recognizes the PROTECTED_ENVIRONMENT payload", () => {
    const err = {
      data: {
        code: "PROTECTED_ENVIRONMENT",
        message: "production is a protected environment.",
        environments: ["production"],
      },
    };
    expect(isProtectedEnvironmentError(err)).toBe(true);
  });

  it("rejects a plain string ConvexError payload", () => {
    expect(isProtectedEnvironmentError({ data: "some other error" })).toBe(
      false
    );
  });

  it("rejects errors with no data at all", () => {
    expect(isProtectedEnvironmentError(new Error("boom"))).toBe(false);
    expect(isProtectedEnvironmentError(null)).toBe(false);
    expect(isProtectedEnvironmentError(undefined)).toBe(false);
  });
});

describe("formatProtectedEnvironments", () => {
  it("uses singular phrasing for one environment", () => {
    expect(formatProtectedEnvironments(["production"])).toBe(
      "production is protected"
    );
  });

  it("uses plural phrasing for several environments", () => {
    expect(formatProtectedEnvironments(["staging", "production"])).toBe(
      "staging, production are protected"
    );
  });
});

describe("push: protectedPushRefusalMessage", () => {
  it("names the environment and points at --request", () => {
    expect(protectedPushRefusalMessage(["production"])).toBe(
      "production is protected. Nothing was pushed. Re-run with --request to propose these changes for approval."
    );
  });
});

describe("push: formatRequestedRows", () => {
  it("maps the requested array to table rows", () => {
    expect(
      formatRequestedRows([
        { key: "API_KEY", requestId: "req1" },
        { key: "DB_URL", requestId: "req2" },
      ])
    ).toEqual([
      { key: "API_KEY", requestId: "req1" },
      { key: "DB_URL", requestId: "req2" },
    ]);
  });

  it("returns an empty array when nothing was requested", () => {
    expect(formatRequestedRows(undefined)).toEqual([]);
  });
});

describe("push: isRequestFilingComplete", () => {
  it("is complete when nothing was denied or skipped", () => {
    expect(isRequestFilingComplete({})).toBe(true);
    expect(isRequestFilingComplete({ deniedKeys: [], skipped: 0 })).toBe(true);
  });

  it("is incomplete when a key was denied", () => {
    expect(isRequestFilingComplete({ deniedKeys: ["API_KEY"] })).toBe(false);
  });

  it("is incomplete when keys were skipped", () => {
    expect(isRequestFilingComplete({ skipped: 2 })).toBe(false);
  });
});

describe("requests: findMatchingChangeRequest", () => {
  const row = (overrides: Partial<ChangeRequestRow>): ChangeRequestRow => ({
    _id: "cr1",
    resourceType: "variable",
    kind: "update",
    label: "DATABASE_URL",
    environments: ["production"],
    status: "pending",
    createdAt: Date.now(),
    requester: null,
    ...overrides,
  });

  it("finds the row whose id matches", () => {
    const rows = [row({ _id: "cr1" }), row({ _id: "cr2" })];
    expect(findMatchingChangeRequest(rows, "cr2")?._id).toBe("cr2");
  });

  it("returns null when no row matches — the id is an ordinary variable request", () => {
    const rows = [row({ _id: "cr1" })];
    expect(findMatchingChangeRequest(rows, "vr1")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findMatchingChangeRequest([], "cr1")).toBeNull();
  });
});

describe("secrets: requestedSuccessMessage", () => {
  it("includes the request id", () => {
    expect(requestedSuccessMessage("req_123")).toBe(
      "Sent for approval (request req_123)."
    );
  });
});

describe("secrets: protectedDeletePrompt", () => {
  it("asks whether to file a change request", () => {
    expect(protectedDeletePrompt(["production"])).toBe(
      "production is protected. File a change request to delete it?"
    );
  });
});

describe("secrets: PROTECTED_DELETE_HINT", () => {
  it("tells the user how to proceed non-interactively", () => {
    expect(PROTECTED_DELETE_HINT).toBe(
      "Re-run with --yes to file a change request."
    );
  });
});
