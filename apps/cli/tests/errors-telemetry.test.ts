import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureError: vi.fn(),
  flushSentry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/sentry.js", () => sentry);

import { CLIError, ErrorCodes, handleError } from "../src/lib/errors.js";

describe("CLI error telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports operational failures with safe diagnostic tags", async () => {
    const error = Object.assign(new Error("Refresh unavailable"), {
      code: "SESSION_REFRESH_RETRY",
      statusCode: 0,
    });

    await expect(handleError(error)).rejects.toThrow("exit:1");

    expect(sentry.captureError).toHaveBeenCalledWith(error, {
      errorType: "Error",
      errorCode: "SESSION_REFRESH_RETRY",
      statusCode: "0",
    });
    expect(sentry.flushSentry).toHaveBeenCalledOnce();
  });

  it("does not report expected authentication failures", async () => {
    const error = new CLIError(
      "You are not authenticated.",
      ErrorCodes.NOT_AUTHENTICATED
    );

    await expect(handleError(error)).rejects.toThrow("exit:2");

    expect(sentry.captureError).not.toHaveBeenCalled();
    expect(sentry.flushSentry).toHaveBeenCalledOnce();
  });

  it("does not report an expired WorkOS session", async () => {
    const error = Object.assign(new Error("Session expired"), {
      code: "SESSION_EXPIRED",
      statusCode: 401,
    });

    await expect(handleError(error)).rejects.toThrow("exit:2");

    expect(sentry.captureError).not.toHaveBeenCalled();
    expect(sentry.flushSentry).toHaveBeenCalledOnce();
  });
});
