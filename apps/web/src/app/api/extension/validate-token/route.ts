import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";

const validateTokenSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

/**
 * POST /api/extension/validate-token - Validate an access token
 */
export async function POST(request: Request) {
  const start = Date.now();
  const log = createLogger("ext/validate-token", { ip: clientIp(request) });

  log.debug("request_start");

  try {
    const body = await request.json();
    const validation = validateTokenSchema.safeParse(body);

    if (!validation.success) {
      log.warn("invalid_body", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { accessToken } = validation.data;
    const childLog = log.child({ token: tokenPrefix(accessToken) });

    const result = await convex.query(api.projectAccess.validateToken, {
      accessToken,
    });

    childLog.info("validation_complete", {
      valid: Boolean(result),
      duration_ms: since(start),
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRateLimitError(error)) {
      log.warn("upstream_rate_limited", {
        error: message,
        duration_ms: since(start),
      });
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }
    log.error(
      "unhandled_error",
      {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: since(start),
      },
      error
    );
    return NextResponse.json(
      { error: "Failed to validate token" },
      { status: 500 }
    );
  }
}
