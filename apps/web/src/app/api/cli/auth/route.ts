import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import {
  extractBearerToken,
  validateCLIToken,
  unauthorizedResponse,
} from "@/lib/cli-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/cli/auth/initiate
 * Initiate CLI authentication flow
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Handle different actions based on query param
  if (action === "initiate") {
    return handleInitiate(request);
  }

  if (action === "refresh") {
    return handleRefresh(request);
  }

  if (action === "revoke") {
    return handleRevoke(request);
  }

  // Default: initiate
  return handleInitiate(request);
}

/**
 * GET /api/cli/auth?action=poll&code=XXX
 * Poll for authentication status
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "poll") {
    return handlePoll(request);
  }

  if (action === "me") {
    return handleMe(request);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * Handle initiate action
 */
async function handleInitiate(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const deviceName = body.deviceName || "CLI";

    const result = await convex.mutation(api.cliSessions.initiate, {
      deviceName,
    });

    // Build the auth URL for the browser
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const authUrl = `${appUrl}/cli/auth?code=${result.code}`;

    return NextResponse.json({
      code: result.code,
      url: authUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error("CLI auth initiate error:", error);
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
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
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
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("CLI auth poll error:", error);
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
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Missing refresh token" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.cliSessions.refreshToken, {
      refreshToken,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("CLI auth refresh error:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("Invalid") ||
        error.message.includes("revoked")
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }

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
  const token = extractBearerToken(request);

  if (!token) {
    return unauthorizedResponse("Missing authorization header");
  }

  try {
    await convex.mutation(api.cliSessions.revokeToken, {
      accessToken: token,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CLI auth revoke error:", error);
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
  const token = extractBearerToken(request);

  if (!token) {
    return unauthorizedResponse("Missing authorization header");
  }

  try {
    const authResult = await validateCLIToken(convex, token);

    if (!authResult.valid) {
      return unauthorizedResponse(authResult.error || "Invalid token");
    }

    return NextResponse.json(authResult.user);
  } catch (error) {
    console.error("CLI auth me error:", error);
    return NextResponse.json(
      { error: "Failed to get user info" },
      { status: 500 }
    );
  }
}
