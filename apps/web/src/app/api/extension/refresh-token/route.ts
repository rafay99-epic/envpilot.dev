import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const refreshTokenSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
});

/**
 * POST /api/extension/refresh-token - Refresh an access token's expiration
 */
export async function POST(request: Request) {
  const start = Date.now();
  const log = createLogger("ext/refresh-token", { ip: clientIp(request) });

  log.debug("request_start");

  try {
    const body = await request.json();
    const validation = refreshTokenSchema.safeParse(body);

    if (!validation.success) {
      log.warn("invalid_body", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { accessToken, expiresInDays } = validation.data;
    const childLog = log.child({
      token: tokenPrefix(accessToken),
      expires_in_days: expiresInDays,
    });

    const result = await convex.mutation(api.projectAccess.refresh, {
      accessToken,
      expiresInDays,
    });

    childLog.info("refresh_complete", { duration_ms: since(start) });

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
      { error: "Failed to refresh token" },
      { status: 500 }
    );
  }
}
