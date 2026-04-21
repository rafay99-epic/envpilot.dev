import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";
import * as crypto from "crypto";

function generateToken(length: number = 64): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * POST /api/extension/auth/callback - Complete the extension auth flow
 *
 * Called from the browser after the user logs in via WorkOS. Stores a
 * pending handshake record in Convex that the extension's polling endpoint
 * will consume. Convex is used (not in-memory state) because serverless
 * Lambdas don't share memory — the callback and polling check routinely
 * land on different instances.
 */
export async function POST(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const sessionToken = searchParams.get("session");
  const log = createLogger("ext-auth/callback", {
    session: tokenPrefix(sessionToken),
    ip: clientIp(request),
  });

  log.info("request_start");

  try {
    const { user } = await withAuth();

    if (!user) {
      log.warn("unauthenticated", { duration_ms: since(start) });
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!sessionToken) {
      log.warn("missing_session_token", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    // Create or get the Convex user
    const userStart = Date.now();
    const convexUser = await getOrCreateConvexUser(convex, user);
    log.debug("convex_user_resolved", {
      convex_user_id: convexUser._id,
      email: convexUser.email,
      duration_ms: since(userStart),
    });

    // Generate tokens for the extension
    const accessToken = "ext_" + generateToken(32);
    const refreshToken = "ext_refresh_" + generateToken(48);
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

    // Persist the long-lived extension token for later validation
    const tokenStart = Date.now();
    await convex.mutation(api.cliSessions.storeExtensionToken, {
      userId: convexUser._id,
      accessToken,
      refreshToken,
      deviceName: "VS Code Extension",
      expiresAt,
    });
    log.debug("token_stored", { duration_ms: since(tokenStart) });

    // Store the short-lived handshake record in Convex so the polling
    // check endpoint can read it regardless of which Lambda it hits.
    const handshakeStart = Date.now();
    await convex.mutation(api.pendingExtensionAuthSessions.store, {
      sessionToken,
      workosUserId: user.id,
      email: convexUser.email,
      name: convexUser.name || undefined,
      accessToken,
      refreshToken,
      tokenExpiresAt: expiresAt,
    });
    log.debug("handshake_stored", { duration_ms: since(handshakeStart) });

    log.info("success", {
      convex_user_id: convexUser._id,
      email: convexUser.email,
      duration_ms: since(start),
    });

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
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
      { error: "Failed to complete auth" },
      { status: 500 }
    );
  }
}
