import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { pendingSessions } from "../check/route";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import * as crypto from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function generateToken(length: number = 64): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * POST /api/extension/auth/callback - Complete the extension auth flow
 *
 * This endpoint is called when the user authenticates in the browser.
 * It stores the session for the extension to retrieve.
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get("session");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 },
      );
    }

    // Create or get the Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Generate tokens for the extension
    const accessToken = "ext_" + generateToken(32);
    const refreshToken = "ext_refresh_" + generateToken(48);
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

    // Persist the token in Convex for later validation
    await convex.mutation(api.cliSessions.storeExtensionToken, {
      userId: convexUser._id,
      accessToken,
      refreshToken,
      deviceName: "VS Code Extension",
      expiresAt,
    });

    // Store the pending session for the extension to retrieve
    pendingSessions.set(sessionToken, {
      userId: user.id,
      email: convexUser.email,
      name: convexUser.name || null,
      accessToken,
      refreshToken,
      expiresAt,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
