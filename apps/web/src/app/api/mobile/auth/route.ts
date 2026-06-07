import { NextRequest, NextResponse } from "next/server";
import { WorkOS } from "@workos-inc/node";
import { z } from "zod";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import {
  extractBearerToken,
  validateMobileToken,
  unauthorizedResponse,
} from "@/lib/mobile-auth";
import {
  clientIp,
  createLogger,
  isRateLimitError,
  since,
  tokenPrefix,
} from "@/lib/logger";

const callbackSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().optional(),
  redirectUri: z.string().optional(),
  deviceName: z.string().max(100).default("Mobile Device"),
  deviceId: z.string().max(100).min(1),
  platform: z.enum(["ios", "android"]).default("ios"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});

const workos = new WorkOS(process.env.WORKOS_API_KEY);

/**
 * POST /api/mobile/auth?action=callback|refresh|revoke
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "callback") return handleCallback(request);
  if (action === "refresh") return handleRefresh(request);
  if (action === "revoke") return handleRevoke(request);
  return handleCallback(request);
}

/**
 * Exchange OAuth code for mobile tokens
 */
async function handleCallback(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("mobile-auth/callback", { ip: clientIp(request) });
  log.info("request_start");

  try {
    const body = await request.json();
    const parsed = callbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { code, codeVerifier, deviceName, deviceId, platform } = parsed.data;

    const authResponse =
      await workos.userManagement.authenticateWithCode({
        code,
        clientId: process.env.WORKOS_CLIENT_ID!,
        codeVerifier: codeVerifier || undefined,
      });

    const workosUser = authResponse.user;

    const existingUser = await convex.query(api.users.getByWorkosId, {
      workosId: workosUser.id,
    });

    let userId;
    if (existingUser) {
      userId = existingUser._id;
    } else {
      userId = await convex.mutation(api.users.upsert, {
        workosId: workosUser.id,
        email: workosUser.email,
        name:
          [workosUser.firstName, workosUser.lastName]
            .filter(Boolean)
            .join(" ") || undefined,
        avatarUrl: workosUser.profilePictureUrl || undefined,
      });
    }

    const user = await convex.query(api.users.getById, { userId });

    const tokenResult = await convex.mutation(api.mobileTokens.createToken, {
      userId,
      deviceName,
      deviceId,
      platform,
    });

    log.info("auth_complete", {
      user_email: workosUser.email,
      duration_ms: since(start),
    });

    return NextResponse.json({
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
      user: {
        _id: userId,
        email: user?.email ?? workosUser.email,
        name:
          user?.name ??
          [workosUser.firstName, workosUser.lastName]
            .filter(Boolean)
            .join(" ") ??
          undefined,
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
        { error: "Too many requests. Please try again." },
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
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

/**
 * Refresh mobile access token
 */
async function handleRefresh(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("mobile-auth/refresh", { ip: clientIp(request) });

  try {
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.mobileTokens.refreshToken, {
      refreshToken: parsed.data.refreshToken,
    });

    log.info("refresh_complete", {
      token: tokenPrefix(parsed.data.refreshToken),
      duration_ms: since(start),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      error instanceof Error &&
      (message.includes("Invalid") || message.includes("expired"))
    ) {
      log.warn("refresh_failed_invalid", {
        error: message,
        duration_ms: since(start),
      });
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
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

/**
 * Revoke mobile token (sign out)
 */
async function handleRevoke(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("mobile-auth/revoke", { ip: clientIp(request) });
  const token = extractBearerToken(request);

  if (!token) {
    return unauthorizedResponse("Missing authorization header");
  }

  try {
    await convex.mutation(api.mobileTokens.revokeToken, {
      accessToken: token,
    });

    log.info("revoke_complete", {
      token: tokenPrefix(token),
      duration_ms: since(start),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
      { error: "Failed to revoke token" },
      { status: 500 }
    );
  }
}
