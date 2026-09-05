import { describe, it, expect } from "vitest";
import {
  isProtectedEnvironmentError,
  formatProtectedEnvironments,
} from "../src/lib/errors.js";
import {
  protectedPushRefusalMessage,
  formatRequestedRows,
  isRequestFilingComplete,
  isProposedResult,
} from "../src/commands/push.js";
import {
  requestedSuccessMessage,
  protectedDeletePrompt,
  PROTECTED_DELETE_HINT,
} from "../src/commands/secrets.js";
import { findChangeRequest } from "../src/commands/requests.js";
import type { APIClient, ChangeRequestRow } from "../src/lib/api.js";

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

describe("push: isProposedResult", () => {
  it("is true on a rerun where every key was already filed (empty requested)", () => {
    // Previously checked `requested.length > 0`, which fell through to the
    // direct-write success message for exactly this shape.
    expect(
      isProposedResult({
        created: 0,
        updated: 0,
        deleted: 0,
        total: 2,
        requested: [],
      })
    ).toBe(true);
  });

  it("is true when keys were newly filed", () => {
    expect(
      isProposedResult({
        created: 0,
        updated: 0,
        deleted: 0,
        total: 1,
        requested: [{ key: "API_KEY", requestId: "req1" }],
      })
    ).toBe(true);
  });

  it("is false for a direct write with no requested field", () => {
    expect(
      isProposedResult({ created: 1, updated: 0, deleted: 0, total: 1 })
    ).toBe(false);
  });
});

describe("requests: findChangeRequest", () => {
  const row: ChangeRequestRow = {
    _id: "cr1",
    resourceType: "variable",
    kind: "update",
    label: "DATABASE_URL",
    environments: ["production"],
    status: "pending",
    createdAt: Date.now(),
    requester: null,
  };

  function apiWith(getChangeRequest: APIClient["getChangeRequest"]): APIClient {
    return { getChangeRequest } as unknown as APIClient;
  }

  it("returns the row when the id is a change request", async () => {
    const api = apiWith(async () => row);
    expect(await findChangeRequest(api, "cr1")).toEqual(row);
  });

  it("returns null when the backend reports the id is not a change request", async () => {
    const api = apiWith(async () => {
      throw { data: "Change request not found" };
    });
    expect(await findChangeRequest(api, "vr1")).toBeNull();
  });

  it("propagates any other error instead of silently falling back", async () => {
    const api = apiWith(async () => {
      throw {
        data: "Your access is limited to these environments: staging",
      };
    });
    await expect(findChangeRequest(api, "cr1")).rejects.toBeTruthy();
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
