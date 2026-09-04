import { describe, expect, it } from "vitest";

import { sanitizeConvexError } from "@/lib/error-messages";

/**
 * Structured ConvexError payloads (e.g. PROTECTED_ENVIRONMENT) carry their
 * user-facing text in a `message` field alongside a `code` field callers
 * branch on via `getConvexErrorData`. `sanitizeConvexError` must surface
 * that `message`, not fall through to the generic Error string.
 */
describe("sanitizeConvexError", () => {
  it("returns the message field of an object ConvexError payload", () => {
    const error = new Error(
      "Uncaught ConvexError: [object Object]"
    ) as Error & {
      data: unknown;
    };
    error.data = {
      code: "PROTECTED_ENVIRONMENT",
      message:
        "production is a protected environment. Propose this change instead.",
      environments: ["production"],
    };
    expect(sanitizeConvexError(error)).toBe(
      "production is a protected environment. Propose this change instead."
    );
  });

  it("still returns a plain string payload directly", () => {
    const error = new Error(
      "Uncaught ConvexError: Variable key already exists"
    ) as Error & {
      data: unknown;
    };
    error.data = "Variable key already exists in this project";
    expect(sanitizeConvexError(error)).toBe(
      "Variable key already exists in this project"
    );
  });
});
