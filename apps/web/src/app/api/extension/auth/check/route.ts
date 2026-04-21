import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";

/**
 * GET /api/extension/auth/check - Check if an auth session has been completed
 *
 * The extension polls this every 2s after opening the browser. The companion
 * callback endpoint writes a pending session record into Convex (NOT
 * in-memory — serverless functions don't share memory, and an in-memory Map
 * caused the extension to time out whenever the callback and check landed on
 * different Lambda instances).
 */
export async function GET(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const sessionToken = searchParams.get("session");
  const log = createLogger("ext-auth/check", {
    session: tokenPrefix(sessionToken),
    ip: clientIp(request),
  });

  log.debug("poll_start");

  try {
    if (!sessionToken) {
      log.warn("missing_session_token", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    // Atomically read + delete the pending session in Convex.
    const consumeStart = Date.now();
    const pending = await convex.mutation(
      api.pendingExtensionAuthSessions.consume,
      { sessionToken }
    );
    log.debug("consume_complete", {
      duration_ms: since(consumeStart),
      found: pending !== null,
    });

    if (!pending) {
      // Normal case while user is still on the browser auth page; noisy
      // but `debug` keeps it out of the default Vercel log filter.
      log.debug("poll_miss", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    const userStart = Date.now();
    const user = await convex.query(api.users.getByWorkosId, {
      workosId: pending.workosUserId,
    });
    log.debug("user_lookup_complete", { duration_ms: since(userStart) });

    if (!user) {
      log.error("user_not_found", {
        workos_user_id: pending.workosUserId,
        duration_ms: since(start),
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    log.info("poll_hit", {
      convex_user_id: user._id,
      email: user.email,
      duration_ms: since(start),
    });

    return NextResponse.json({
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name || null,
          avatarUrl: user.avatarUrl || null,
        },
        accessToken: pending.accessToken,
        refreshToken: pending.refreshToken,
        expiresAt: pending.tokenExpiresAt,
      },
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
      { error: "Failed to check auth session" },
      { status: 500 }
    );
  }
}
