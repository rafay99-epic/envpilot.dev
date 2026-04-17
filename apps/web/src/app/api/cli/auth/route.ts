import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import {
  extractBearerToken,
  validateCLIToken,
  unauthorizedResponse,
} from "@/lib/cli-auth";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/cli/auth?action=initiate|refresh|revoke
 * Dispatches to the appropriate handler based on the `action` query param.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "initiate") return handleInitiate(request);
  if (action === "refresh") return handleRefresh(request);
  if (action === "revoke") return handleRevoke(request);
  return handleInitiate(request);
}

/**
 * GET /api/cli/auth?action=poll&code=XXX
 * Poll for authentication status
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "poll") return handlePoll(request);
  if (action === "me") return handleMe(request);

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * Handle initiate action
 */
async function handleInitiate(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("cli-auth/initiate", { ip: clientIp(request) });
  log.info("request_start");

  try {
    const body = await request.json().catch(() => ({}));
    const deviceName = body.deviceName || "CLI";

    const result = await convex.mutation(api.cliSessions.initiate, {
      deviceName,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const authUrl = `${appUrl}/cli/auth?code=${result.code}`;

    log.info("session_created", {
      device_name: deviceName,
      code_prefix: result.code.slice(0, 4),
      expires_at: result.expiresAt,
      duration_ms: since(start),
    });

    return NextResponse.json({
      code: result.code,
      url: authUrl,
      expiresAt: result.expiresAt,
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
      { error: "Failed to initiate authentication" },
      { status: 500 }
    );
  }
}

/**
 * Handle poll action
 */
async function handlePoll(request: NextRequest) {
  const start = Date.now();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const log = createLogger("cli-auth/poll", {
    ip: clientIp(request),
    code_prefix: code ? code.slice(0, 4) : "none",
  });

  if (!code) {
    log.warn("missing_code", { duration_ms: since(start) });
    return NextResponse.json(
      { error: "Missing code parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await convex.query(api.cliSessions.poll, {
      code: code.toUpperCase(),
    });

    if (result.status === "not_found") {
      log.warn("session_not_found", { duration_ms: since(start) });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    log.debug("poll_complete", {
      status: result.status,
      duration_ms: since(start),
    });

    return NextResponse.json(result);
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
      { error: "Failed to poll authentication status" },
      { status: 500 }
    );
  }
}

/**
 * Handle refresh action
 */
async function handleRefresh(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("cli-auth/refresh", { ip: clientIp(request) });

  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      log.warn("missing_refresh_token", { duration_ms: since(start) });
      return NextResponse.json(
        { error: "Missing refresh token" },
        { status: 400 }
      );
    }

    const childLog = log.child({ token: tokenPrefix(refreshToken) });

    const result = await convex.mutation(api.cliSessions.refreshToken, {
      refreshToken,
    });

    childLog.info("refresh_complete", { duration_ms: since(start) });
    return NextResponse.json(result);
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

    if (
      error instanceof Error &&
      (error.message.includes("Invalid") || error.message.includes("revoked"))
    ) {
      log.warn("token_invalid_or_revoked", {
        error: message,
        duration_ms: since(start),
      });
      return NextResponse.json({ error: error.message }, { status: 401 });
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

/**
 * Handle revoke action
 */
async function handleRevoke(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("cli-auth/revoke", { ip: clientIp(request) });
  const token = extractBearerToken(request);

  if (!token) {
    log.warn("missing_auth_header", { duration_ms: since(start) });
    return unauthorizedResponse("Missing authorization header");
  }

  const childLog = log.child({ token: tokenPrefix(token) });

  try {
    await convex.mutation(api.cliSessions.revokeToken, {
      accessToken: token,
    });

    childLog.info("revoke_complete", { duration_ms: since(start) });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    childLog.error(
      "unhandled_error",
      {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: since(start),
      },
      error
    );
    return NextResponse.json(
      { error: "Failed to revoke token" },
      { status: 500 }
    );
  }
}

/**
 * Handle me action (get current user)
 */
async function handleMe(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("cli-auth/me", { ip: clientIp(request) });
  const token = extractBearerToken(request);

  if (!token) {
    log.warn("missing_auth_header", { duration_ms: since(start) });
    return unauthorizedResponse("Missing authorization header");
  }

  const childLog = log.child({ token: tokenPrefix(token) });

  try {
    const authResult = await validateCLIToken(convex, token);

    if (!authResult.valid) {
      childLog.warn("invalid_token", {
        reason: authResult.error,
        duration_ms: since(start),
      });
      return unauthorizedResponse(authResult.error || "Invalid token");
    }

    childLog.info("me_returned", { duration_ms: since(start) });
    return NextResponse.json(authResult.user);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    childLog.error(
      "unhandled_error",
      {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: since(start),
      },
      error
    );
    return NextResponse.json(
      { error: "Failed to get user info" },
      { status: 500 }
    );
  }
}
